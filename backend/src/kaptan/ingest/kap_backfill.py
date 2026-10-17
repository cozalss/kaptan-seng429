"""KAP backfill (07 §4): `members/byCriteria` one day at a time, resumable via ops.ingestion_runs.

- Weekends are included (disclosures arrive on any day). A day already 'done' is skipped unless forced.
- 2000 rows is a hard cap per answer: a capped day is re-queried per disclosure class; a class that is
  still capped marks the day 'partial' (07 Q-K2: never a silent truncation).
- Rows: `ingest_source='backfill'`, `first_seen_at` NULL, `available_at = published_at + 60 s`,
  `visible=false` (history never enters "today's" feed), no SSE.
- Optional: the raw day answer is written gzipped to `<raw_dir>/raw_kap_daily/yyyy/mm/dd.json.gz`
  first (re-normalise without hitting KAP again); target subjects are queued for detail texts
  (priority 1 for the 2025–2026 holdout, 2 before).
- Politeness comes from the shared KapClient (≥ KAP_MIN_INTERVAL_S between requests). A WAF signal
  stops the run; rerun later and it resumes at the first unfinished day.
"""

from __future__ import annotations

import gzip
import json
import logging
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Final

from kaptan.ingest import repo
from kaptan.ingest.kap_client import KapBlockedError, KapClient, KapError
from kaptan.ingest.normalize import normalize_rows
from kaptan.ingest.subject_routes import wants_detail

log = logging.getLogger("kaptan.ingest.backfill")

JOB: Final = "kap_backfill"
CAP: Final = 2000
CLASSES: Final = ("ODA", "FR", "DG", "DKB", "DUY")
HOLDOUT_START: Final = date(2025, 1, 1)


@dataclass(slots=True)
class BackfillReport:
    days: int = 0
    skipped_days: int = 0
    partial_days: list[str] = field(default_factory=list)
    failed_days: list[str] = field(default_factory=list)
    rows: int = 0
    inserted: int = 0
    updated: int = 0
    skipped: int = 0
    queued_details: int = 0
    errors: list[str] = field(default_factory=list)


def daterange(start: date, end: date) -> Iterator[date]:
    day = start
    while day <= end:
        yield day
        day += timedelta(days=1)


def detail_priority(day: date) -> int:
    return 1 if day >= HOLDOUT_START else 2


async def fetch_day(client: KapClient, day: date) -> tuple[list[dict[str, Any]], bool]:
    """(rows, complete). Splits a capped day by disclosure class."""
    rows = await client.by_criteria(day, day)
    if len(rows) < CAP:
        return rows, True
    log.info("%s: %d rows (cap) → per-class queries", day, len(rows))
    out: list[dict[str, Any]] = []
    complete = True
    for cls in CLASSES:
        part = await client.by_criteria(day, day, disclosure_class=cls)
        if len(part) >= CAP:
            log.error("%s class %s still capped at %d rows: day is partial", day, cls, len(part))
            complete = False
        out.extend(part)
    return out, complete


def write_raw(raw_dir: Path, day: date, rows: list[dict[str, Any]]) -> Path:
    path = raw_dir / "raw_kap_daily" / f"{day:%Y}" / f"{day:%m}" / f"{day:%d}.json.gz"
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        json.dump(rows, fh, ensure_ascii=False)
    return path


async def refresh_members(pool: Any, client: KapClient, today: date) -> repo.CompanyIndex:
    items = await client.company_items("IGS")
    async with pool.connection() as conn:
        async with conn.transaction():
            await repo.upsert_companies(conn, items, today)
        return await repo.load_company_index(conn)


async def store_day(
    conn: Any,
    day: date,
    rows: list[dict[str, Any]],
    companies: repo.CompanyIndex,
    *,
    queue_details: bool,
    report: BackfillReport,
) -> int:
    normalized, errors = normalize_rows(rows, source="backfill", seen_at=None)
    report.errors.extend(f"{day}: {e}" for e in errors)
    async with conn.transaction():
        for d in normalized:
            status = await repo.upsert_disclosure(conn, d, companies, visible=False)
            setattr(report, status, getattr(report, status) + 1)
            if queue_details and status == "inserted" and wants_detail(d.subject_route):
                await repo.enqueue_detail(conn, d.disclosure_index, detail_priority(day))
                report.queued_details += 1
    return len(normalized)


async def backfill(
    pool: Any,
    client: KapClient,
    start: date,
    end: date,
    *,
    companies: repo.CompanyIndex | None = None,
    raw_dir: Path | None = None,
    queue_details: bool = False,
    force: bool = False,
) -> BackfillReport:
    if end < start:
        raise ValueError("--to is before --from")
    report = BackfillReport()
    index = companies or repo.CompanyIndex()
    for day in daterange(start, end):
        key = day.isoformat()
        async with pool.connection() as conn:
            if not force and await repo.run_status(conn, JOB, key) == "done":
                report.skipped_days += 1
                continue
            await conn.commit()  # no transaction stays open across the KAP request
            async with conn.transaction():
                await repo.mark_run(conn, JOB, key, "running")
            try:
                rows, complete = await fetch_day(client, day)
            except KapBlockedError as exc:
                async with conn.transaction():
                    await repo.mark_run(conn, JOB, key, "failed", error=str(exc))
                report.failed_days.append(key)
                log.error("backfill stopped at %s: %s (rerun later; it resumes here)", key, exc)
                raise
            except KapError as exc:
                async with conn.transaction():
                    await repo.mark_run(conn, JOB, key, "failed", error=str(exc))
                report.failed_days.append(key)
                log.warning("backfill %s failed: %s", key, exc)
                continue
            if raw_dir is not None:
                write_raw(raw_dir, day, rows)
            stored = await store_day(conn, day, rows, index, queue_details=queue_details, report=report)
            status = "done" if complete else "partial"
            if not complete:
                report.partial_days.append(key)
            async with conn.transaction():
                await repo.mark_run(conn, JOB, key, status, rows=stored)
        report.days += 1
        report.rows += stored
        log.info("backfill %s: %d rows (%s)", key, stored, status)
    return report
