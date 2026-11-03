"""The archive backfill: KAP disclosures and prices 2018 → today, so past events can become evidence (07 §4, 06 §12).

    uv run python -m kaptan.live.archive                         # all steps; rerun any time, it resumes
    uv run python -m kaptan.live.archive --steps returns,report  # only some
    uv run python -m kaptan.live.archive --rename KOZAL:TRALT    # accept a code change the report suggested
    uv run python -m kaptan.live.archive --classify-max-calls 1000 --classify-max-usd 2  # paid, opt-in

Steps, each resumable and safe beside the running system:

1. **disclosures**: the member list, then `byCriteria` one day at a time (`kaptan.ingest.kap_backfill`, checkpoint
   per day in ops.ingestion_runs; `first_seen_at` NULL, `available_at` = published + 60 s, invisible, no agent run).
2. **prices**: İş Yatırım + Yahoo for every company an E-typed notice names (checkpoint per code; renamed codes through
   core.ticker_history; Yahoo's adjusted rows stay out, except XU100, only İş Yatırım's are read).
3. **texts**: the full text of E1 and company-filed E2 notices (the parsers say executed / net purchase, the
   evidence definition needs it). Stored directly, not through the live queue: it never competes with today's rows.
4. **returns**: `core.events` + `core.event_returns` outside the sealed holdout (`kaptan.reference.event_returns`).
5. **report**: counts per type and year, gaps, what may be a renamed code. It never reads a return of the holdout.

No model is called unless both --classify-* limits are given (`kaptan.live.archive_classify`).

Polite: one request at a time, ≥ --kap-interval (default 3 s, the live poller shares KAP's WAF) and ≥ the price
interval apart. A WAF signal waits --block-wait minutes and resumes, at most --block-retries times; then exit 2.
Exit 0 = done (gaps are reported, not hidden); 1 = a day or a code failed (rerun); 2 = stopped by the WAF.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, Final

from kaptan.evidence.holdout import E_CODES
from kaptan.ingest import repo as kap_repo
from kaptan.ingest.detail_fetcher import reason_from
from kaptan.ingest.kap_backfill import BackfillReport, backfill, daterange, refresh_members
from kaptan.ingest.kap_client import KapBlockedError, KapError
from kaptan.ingest.kap_detail import DetailText, fetch_detail
from kaptan.ingest.parsers import parse_detail
from kaptan.live.archive_classify import ClassifyBudget, ClassifyResult, run_classify
from kaptan.live.archive_report import archive_report, format_report
from kaptan.llm.provider import LLMProvider
from kaptan.llm.registry import ModelsConfig
from kaptan.prices.calendar import FIRST_YEAR, IST, istanbul_date, prev_session
from kaptan.prices.http import SourceError
from kaptan.prices.ingest import Fetched, Source, store_fetched
from kaptan.reference._sql import execute, fetch_all
from kaptan.reference.event_returns import run_archive_returns
from kaptan.reference.ticker_history import add_rename, current_code
from kaptan.text.turkish import norm_key

log = logging.getLogger("kaptan.live.archive")

STEPS: Final = ("disclosures", "prices", "texts", "returns", "report")
CANONICAL_START: Final = date(FIRST_YEAR, 1, 1)  # 07 §4: 2018-01-01 → today; the BIST calendar starts there too
ARCHIVE_INTERVAL_S: Final = 3.0
BLOCK_WAIT_MIN: Final = 30.0
BLOCK_RETRIES: Final = 3
PRICES_JOB: Final = "archive_prices"
TEXT_JOB: Final = "archive_text"
XU100: Final = "XU100"
TICK_EVERY_S: Final = 60.0

TICKERS_SQL: Final = """
SELECT DISTINCT d.primary_ticker AS ticker FROM core.disclosures d
 WHERE d.origin = 'kap' AND d.primary_ticker IS NOT NULL AND NOT d.is_noise
   AND (d.subject_route = ANY(%(codes)s::text[]) OR d.classification ->> 'event_type' = ANY(%(codes)s::text[]))
   AND d.published_at >= %(lo)s AND d.published_at < %(hi)s
 ORDER BY 1
"""
#: MKK-forwarded E2 (class DKB, sender KAP) keeps the trade in an attachment: its text says nothing.
TEXTS_TODO_SQL: Final = """
SELECT d.disclosure_index, d.subject FROM core.disclosures d
 WHERE d.origin = 'kap' AND d.published_at >= %(lo)s AND d.published_at < %(hi)s
   AND (d.subject_route = 'E1' OR (d.subject_route = 'E2' AND d.disclosure_class = 'ODA'))
   AND NOT EXISTS (
     SELECT 1 FROM core.disclosure_texts t WHERE t.disclosure_index = d.disclosure_index AND t.lang = 'tr'
   )
 ORDER BY d.published_at, d.disclosure_index
"""
CLEAR_SETTLED_SQL: Final = "UPDATE core.events SET returns_settled_at = NULL WHERE returns_settled_at IS NOT NULL"
GAP_NAMES_SQL: Final = """
SELECT DISTINCT company_name FROM core.disclosures WHERE origin = 'kap' AND primary_ticker = %s AND company_name <> ''
"""

Sleep = Callable[[float], Awaitable[Any]]
FetchPrices = Callable[[str, date, date, tuple[Source, ...]], Awaitable[Fetched]]
FetchText = Callable[[Any, int], Awaitable[DetailText]]


@dataclass(frozen=True, slots=True)
class Plan:
    start: date
    end: date
    steps: tuple[str, ...] = STEPS
    raw_dir: Path | None = None
    block_wait_s: float = BLOCK_WAIT_MIN * 60
    block_retries: int = BLOCK_RETRIES
    report_file: Path | None = None
    classify: ClassifyBudget | None = None  # None (the default): no model is ever called


@dataclass(slots=True)
class ArchiveResult:
    disclosures: BackfillReport = field(default_factory=BackfillReport)
    prices_fetched: list[str] = field(default_factory=list)
    prices_empty: list[str] = field(default_factory=list)
    prices_failed: list[str] = field(default_factory=list)
    prices_skipped: int = 0
    texts_stored: int = 0
    texts_failed: list[int] = field(default_factory=list)
    returns: dict[str, int] = field(default_factory=dict)
    rename_candidates: dict[str, list[str]] = field(default_factory=dict)
    report: dict[str, Any] = field(default_factory=dict)
    classified: ClassifyResult | None = None

    @property
    def failed(self) -> bool:
        return bool(self.disclosures.failed_days or self.prices_failed or self.texts_failed)


def human_span(seconds: float) -> str:
    """12 s, 3 min, 2 h 05 min: what a person reads in a progress line."""
    if seconds < 90:
        return f"{seconds:.0f} s"
    minutes = int(seconds // 60)
    return f"{minutes} min" if minutes < 120 else f"{minutes // 60} h {minutes % 60:02d} min"


class Meter:
    """One readable line per minute (and the last item): where it is, how much is left, what it found."""

    def __init__(self, label: str, total: int, *, clock: Callable[[], float] = time.monotonic) -> None:
        self.label, self.total, self.clock = label, total, clock
        self.started = clock()
        self.last = self.started

    def line(self, done: int, note: str = "") -> str:
        spent = self.clock() - self.started
        left = spent / done * (self.total - done) if done else 0.0
        pct = 100 * done / self.total if self.total else 100.0
        tail = f" · {note}" if note else ""
        spans = f"{human_span(spent)} so far, ~{human_span(left)} left"
        return f"{self.label}: {done}/{self.total} ({pct:.1f} %) · {spans}{tail}"

    def tick(self, done: int, note: str = "") -> None:
        now = self.clock()
        if done >= self.total or now - self.last >= TICK_EVERY_S:
            self.last = now
            log.info("%s", self.line(done, note))


async def _patient(step: Callable[[], Awaitable[Any]], plan: Plan, sleep: Sleep) -> Any:
    """A WAF signal: wait, then run the (resumable) step again; after the retries the block propagates (exit 2)."""
    for attempt in range(plan.block_retries + 1):
        try:
            return await step()
        except KapBlockedError as exc:
            if attempt == plan.block_retries:
                raise
            log.warning("KAP says back off (%s): waiting %s, then resuming", exc, human_span(plan.block_wait_s))
            await sleep(plan.block_wait_s)
    raise AssertionError("unreachable")  # pragma: no cover


def _bounds(plan: Plan) -> dict[str, datetime]:
    lo = datetime.combine(plan.start, datetime.min.time(), IST)
    hi = datetime.combine(plan.end + timedelta(days=1), datetime.min.time(), IST)
    return {"lo": lo, "hi": hi}


# ── steps ─────────────────────────────────────────────────────────────────────────────────────────


async def step_disclosures(pool: Any, kap: Any, plan: Plan, today: date, result: ArchiveResult, sleep: Sleep) -> None:
    days = sum(1 for _ in daterange(plan.start, plan.end))
    meter = Meter("KAP days", days)
    done = {"n": 0, "rows": 0}

    def on_day(day: date, rows: int) -> None:
        done["n"], done["rows"] = done["n"] + 1, done["rows"] + rows
        meter.tick(done["n"], f"{day} · {done['rows']} rows this pass")

    async def go() -> BackfillReport:
        done["n"] = 0
        companies = await refresh_members(pool, kap, today)
        return await backfill(pool, kap, plan.start, plan.end, companies=companies, raw_dir=plan.raw_dir, on_day=on_day)

    result.disclosures = await _patient(go, plan, sleep)
    report = result.disclosures
    log.info(
        "KAP: %d days fetched, %d already done, partial %s, failed %s; %d rows (%d new), %d row errors",
        report.days, report.skipped_days, report.partial_days or "-", report.failed_days or "-",
        report.rows, report.inserted, len(report.errors),
    )  # fmt: skip


async def _price_codes(conn: Any, plan: Plan) -> list[str]:
    rows = await fetch_all(conn, TICKERS_SQL, {"codes": E_CODES, **_bounds(plan)})
    codes = [await current_code(conn, str(r["ticker"])) for r in rows]
    return list(dict.fromkeys(codes))


async def _rename_candidates(conn: Any, empty: Sequence[str]) -> dict[str, list[str]]:
    """A code without prices whose company title is a listed company's under another code: a person decides."""
    index = await kap_repo.load_company_index(conn)
    by_title: dict[str, list[str]] = {}
    for ticker, (_, title) in index.by_ticker.items():
        by_title.setdefault(norm_key(title), []).append(ticker)
    out: dict[str, list[str]] = {}
    for code in empty:
        names = [str(r["company_name"]) for r in await fetch_all(conn, GAP_NAMES_SQL, (code,))]
        hits = sorted({t for n in names for t in by_title.get(norm_key(n), []) if t != code})
        if hits:
            out[code] = hits
    return out


async def step_prices(pool: Any, fetch: FetchPrices, plan: Plan, now: datetime, result: ArchiveResult) -> None:
    async with pool.connection() as conn:
        codes = [XU100, *await _price_codes(conn, plan)]
        await conn.commit()
        meter = Meter("price histories", len(codes))
        for i, code in enumerate(codes, 1):
            if await kap_repo.run_status(conn, PRICES_JOB, code) == "done":
                result.prices_skipped += 1
                await conn.commit()
                continue
            sources: tuple[Source, ...] = ("yfinance",) if code == XU100 else ("isyatirim", "yfinance")
            await conn.commit()  # no transaction stays open across a request
            try:
                fetched = await fetch(code, plan.start, plan.end, sources)
                # Yahoo's adjusted bars of a share are never read while İş Yatırım answers: half the rows.
                keep = fetched if code == XU100 or not fetched.raw else replace(fetched, adjusted=())
                report = await store_fetched(conn, keep, now)
            except SourceError as exc:
                log.warning("prices %s: %s", code, exc)
                await kap_repo.mark_run(conn, PRICES_JOB, code, "failed", error=str(exc))
                await conn.commit()
                result.prices_failed.append(code)
                continue
            n = report.raw_rows + report.adjusted_rows
            status = "done" if n else "partial"
            await kap_repo.mark_run(
                conn, PRICES_JOB, code, status, rows=n, error=None if n else "no bars at any source"
            )
            await conn.commit()
            (result.prices_fetched if n else result.prices_empty).append(code)
            meter.tick(i, f"{code}: {n} bars · {len(result.prices_empty)} without any")
        result.rename_candidates = await _rename_candidates(conn, result.prices_empty)
        await conn.commit()


async def step_texts(
    pool: Any, kap: Any, fetch_text: FetchText, plan: Plan, result: ArchiveResult, sleep: Sleep
) -> None:
    async def go() -> None:
        async with pool.connection() as conn:
            todo = await fetch_all(conn, TEXTS_TODO_SQL, _bounds(plan))
            await conn.commit()
            meter = Meter("E1/E2 texts", len(todo))
            for i, row in enumerate(todo, 1):
                idx, subject = int(row["disclosure_index"]), str(row["subject"])
                try:
                    detail = await fetch_text(kap, idx)
                except KapBlockedError:
                    raise
                except KapError as exc:
                    log.info("text %s: %s", idx, exc)
                    async with conn.transaction():
                        await kap_repo.mark_run(conn, TEXT_JOB, str(idx), "failed", error=str(exc))
                    result.texts_failed.append(idx)
                    continue
                parsed = parse_detail(subject, detail.tr)
                async with conn.transaction():
                    await kap_repo.store_detail(conn, detail, parsed, reason_from(parsed))
                result.texts_stored += 1
                meter.tick(i, f"{len(result.texts_failed)} failed")

    await _patient(go, plan, sleep)


async def step_returns(pool: Any, plan: Plan, now: datetime, result: ArchiveResult) -> None:
    async with pool.connection() as conn:
        async with conn.transaction():
            await execute(conn, CLEAR_SETTLED_SQL)  # prices may have arrived since: try the settled events once more
        meters: dict[str, Meter] = {}

        def on_ticker(i: int, total: int, ticker: str) -> None:
            meters.setdefault("m", Meter("event returns (companies)", total)).tick(i, ticker)

        stats = await run_archive_returns(conn, prev_or_same(plan.end), now=now, on_ticker=on_ticker)
        result.returns = {
            "new_events": stats.new_events, "events_worked": stats.pending,
            "rows": stats.rows, "events_without_prices": stats.no_prices,
        }  # fmt: skip


async def _classify_step(
    pool: Any,
    kap: Any,
    fetch_text: FetchText,
    plan: Plan,
    classifier: tuple[LLMProvider, ModelsConfig] | None,
    sleep: Sleep,
) -> ClassifyResult:
    budget = plan.classify
    if budget is None or classifier is None:
        raise ValueError("a classify budget needs a provider")
    provider, models = classifier

    async def go() -> ClassifyResult:
        return await run_classify(pool, provider, kap, fetch_text, budget, models, **_bounds(plan))

    classified: ClassifyResult = await _patient(go, plan, sleep)
    return classified


def prev_or_same(day: date) -> date:
    """The job day of the returns step: `run_event_returns` wants a day; a holiday reads the session before."""
    return prev_session(day + timedelta(days=1))


async def run_archive(
    pool: Any,
    kap: Any,
    fetch_prices: FetchPrices,
    plan: Plan,
    *,
    now: datetime,
    fetch_text: FetchText = fetch_detail,
    sleep: Sleep = asyncio.sleep,
    classifier: tuple[LLMProvider, ModelsConfig] | None = None,
) -> ArchiveResult:
    result = ArchiveResult()
    if "disclosures" in plan.steps:
        await step_disclosures(pool, kap, plan, istanbul_date(now), result, sleep)
    if plan.classify is not None:
        result.classified = await _classify_step(pool, kap, fetch_text, plan, classifier, sleep)
    if "prices" in plan.steps:
        await step_prices(pool, fetch_prices, plan, now, result)
    if "texts" in plan.steps:
        await step_texts(pool, kap, fetch_text, plan, result, sleep)
    if "returns" in plan.steps:
        await step_returns(pool, plan, now, result)
    if "report" in plan.steps:
        async with pool.connection() as conn:
            result.report = await archive_report(conn, result_gaps(result), **_bounds(plan))
            await conn.commit()
        log.info("\n%s", format_report(result.report))
        if plan.report_file is not None:
            plan.report_file.parent.mkdir(parents=True, exist_ok=True)
            plan.report_file.write_text(json.dumps(result.report, ensure_ascii=False, indent=1), encoding="utf-8")
    return result


def result_gaps(result: ArchiveResult) -> dict[str, Any]:
    d = result.disclosures
    return {
        "partial_days": d.partial_days,
        "failed_days": d.failed_days,
        "row_errors": len(d.errors),
        "prices_empty": result.prices_empty,
        "prices_failed": result.prices_failed,
        "rename_candidates": result.rename_candidates,
        "texts_failed": len(result.texts_failed),
        "classified": None if result.classified is None else result.classified.as_doc(),
    }


# ── CLI ───────────────────────────────────────────────────────────────────────────────────────────


def _rename(raw: str) -> tuple[str, str]:
    old, _, new = raw.partition(":")
    if not old or not new:
        raise argparse.ArgumentTypeError("use OLD:NEW, e.g. KOZAL:TRALT")
    return old.strip().upper(), new.strip().upper()


def _steps(raw: str) -> tuple[str, ...]:
    steps = tuple(s.strip() for s in raw.split(",") if s.strip())
    unknown = [s for s in steps if s not in STEPS]
    if unknown:
        raise argparse.ArgumentTypeError(f"unknown step {unknown[0]!r}; choose from {', '.join(STEPS)}")
    return steps


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m kaptan.live.archive", description="Archive backfill 2018 → today")
    p.add_argument("--from", dest="start", type=date.fromisoformat, default=CANONICAL_START)
    p.add_argument("--to", dest="end", type=date.fromisoformat, default=None, help="last day (default: yesterday)")
    p.add_argument("--steps", type=_steps, default=STEPS, help=", ".join(STEPS))
    p.add_argument("--raw-dir", type=Path, default=None, help="keep each KAP day's raw answer (json.gz) here")
    p.add_argument("--kap-interval", type=float, default=ARCHIVE_INTERVAL_S, help="seconds between KAP requests (≥ 2)")
    p.add_argument("--block-wait", type=float, default=BLOCK_WAIT_MIN, help="minutes to wait after a WAF signal")
    p.add_argument("--block-retries", type=int, default=BLOCK_RETRIES)
    p.add_argument("--rename", type=_rename, action="append", default=[], metavar="OLD:NEW")
    p.add_argument("--report-file", type=Path, default=None, help="also write the report here (JSON)")
    p.add_argument("--classify-max-calls", type=int, default=None, help="paid: most Classifier calls in this run")
    p.add_argument("--classify-max-usd", type=float, default=None, help="paid: hard dollar ceiling of this run")
    args = p.parse_args(argv)
    if (args.classify_max_calls is None) != (args.classify_max_usd is None):
        p.error("the Classifier needs both --classify-max-calls and --classify-max-usd")
    if args.classify_max_calls is not None and (args.classify_max_calls <= 0 or args.classify_max_usd <= 0):
        p.error("the --classify-* limits must be above zero")
    if args.kap_interval < 2.0:
        p.error("--kap-interval below 2 s is not polite (07 §1)")
    if args.start < CANONICAL_START:
        p.error(f"the BIST calendar starts at {CANONICAL_START}")
    return args


async def _main(args: argparse.Namespace, settings: Any) -> int:  # pragma: no cover - network wiring
    from kaptan.db import create_pool
    from kaptan.ingest.kap_client import KapClient
    from kaptan.prices.http import PoliteClient, make_http_client
    from kaptan.prices.ingest import fetch_ticker

    now = datetime.now(UTC)
    end = args.end or (istanbul_date(now) - timedelta(days=1))
    budget = None if args.classify_max_calls is None else ClassifyBudget(args.classify_max_calls, args.classify_max_usd)
    plan = Plan(
        args.start, end, args.steps, args.raw_dir, args.block_wait * 60, args.block_retries, args.report_file, budget
    )
    span = (end - args.start).days + 1  # İş Yatırım and Yahoo answer the whole span in one request each
    pool = create_pool(settings.database_url.get_secret_value(), min_size=1, max_size=2)
    await pool.open(wait=True)
    try:
        async with pool.connection() as conn:
            for old, new in args.rename:
                await add_rename(conn, old, new, changed_on=None, source="manual", note="accepted in the archive CLI")
            await conn.commit()
        cfg = replace(_kap_config(settings), min_interval_s=args.kap_interval)
        async with make_http_client() as http, KapClient(cfg) as kap:
            polite = PoliteClient(http, min_interval_s=settings.prices_min_interval_s)

            async def fetch(t: str, start: date, stop: date, sources: tuple[Source, ...]) -> Fetched:
                return await fetch_ticker(polite, t, start, stop, sources, chunk_days=span + 30)

            result = await run_archive(pool, kap, fetch, plan, now=now, classifier=_classifier(settings, budget))
        return 1 if result.failed else 0
    except KapBlockedError as exc:
        log.error("stopped by KAP's WAF (%s). Everything so far is stored; run the same command later.", exc)
        return 2
    finally:
        await pool.close()


def _classifier(
    settings: Any, budget: ClassifyBudget | None
) -> tuple[LLMProvider, ModelsConfig] | None:  # pragma: no cover - network wiring
    """The live chain on the live stack's Redis: the daily LLM caps are shared with the running system."""
    if budget is None:
        return None
    from redis.asyncio import from_url

    from kaptan.llm.factory import build_live_provider
    from kaptan.llm.registry import default_models

    return build_live_provider(settings, redis=from_url(settings.redis_url.get_secret_value())), default_models()


def _kap_config(settings: Any) -> Any:  # pragma: no cover - network wiring
    from kaptan.ingest.kap_client import KapClientConfig

    return KapClientConfig.from_settings(settings)


def main(argv: Sequence[str] | None = None) -> int:  # pragma: no cover - network wiring
    from kaptan.api.loop import run
    from kaptan.settings import ConfigError, get_settings

    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        settings = get_settings()
    except ConfigError as exc:
        log.error("%s", exc)
        return 2
    return run(_main(args, settings))


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
