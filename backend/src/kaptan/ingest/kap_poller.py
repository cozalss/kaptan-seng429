"""The live KAP poller (07 §2.1): today's `list/main`, cursor = max(disclosure_index) in Postgres.

Rhythm (Istanbul time, canonical lower bound 30 s in session; jitter only upwards, +0–20 %):
    weekdays 08:00–19:00 → KAP_POLL_SESSION_S (30 s) · 19:00–24:00 and weekends → KAP_POLL_OFFHOURS_S
    (60 s) · 00:00–08:00 → KAP_POLL_NIGHT_S (5 min).
Failure policy: a WAF signal (666/403/HTML/empty body) or repeated errors → 60, 120, 300, 600 s, never
shorter than the normal interval; 3 failures in a row are logged as errors.
Day boundary: the first poll of a new day also queries the previous day once (midnight leak).
Every 10 minutes the whole day is reconciled (late lower indexes go through the same upsert as
`ingest_source='reconcile'`).

New rows: upsert (dedup by index) → detail queue for target subjects → after commit, SSE `disclosure`
+ `counters` on the feed stream — only outside DEMO_MODE (the demo day owns the feed there; KAP rows
are then stored with visible=false and nothing is published).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Final

from kaptan.ingest import repo
from kaptan.ingest.kap_client import KapClient
from kaptan.ingest.normalize import NormalizedDisclosure, normalize_rows
from kaptan.ingest.publish import publish_new
from kaptan.ingest.subject_routes import wants_detail
from kaptan.text.turkish import IST

log = logging.getLogger("kaptan.ingest.poller")

EMPTY_BACKOFF_S: Final = (60.0, 120.0, 300.0, 600.0)
RECONCILE_EVERY: Final = timedelta(minutes=10)
SESSION_HOURS: Final = (time(8, 0), time(19, 0))
LIVE_PRIORITY: Final = 0


@dataclass(frozen=True, slots=True)
class PollConfig:
    session_s: float = 30.0
    offhours_s: float = 60.0
    night_s: float = 300.0
    demo_mode: bool = False
    fetch_details: bool = True

    @classmethod
    def from_settings(cls, s: Any) -> PollConfig:
        return cls(
            session_s=s.kap_poll_session_s,
            offhours_s=s.kap_poll_offhours_s,
            night_s=s.kap_poll_night_s,
            demo_mode=s.demo_mode,
            fetch_details=s.kap_fetch_details,
        )


def base_interval(now: datetime, cfg: PollConfig) -> float:
    local = now.astimezone(IST)
    t = local.time()
    if t < SESSION_HOURS[0]:
        return cfg.night_s
    if local.weekday() < 5 and t < SESSION_HOURS[1]:
        return max(30.0, cfg.session_s)
    return cfg.offhours_s


def next_delay(now: datetime, cfg: PollConfig, failures: int, rand: float) -> float:
    """Seconds until the next poll: the market-hours interval (+0–20 %), or the failure backoff."""
    base = base_interval(now, cfg)
    if failures > 0:
        base = max(base, EMPTY_BACKOFF_S[min(failures, len(EMPTY_BACKOFF_S)) - 1])
    return base * (1 + 0.2 * rand)


def istanbul_day(now: datetime) -> date:
    return now.astimezone(IST).date()


def day_start_utc(day: date) -> datetime:
    return datetime.combine(day, time(0, 0), tzinfo=IST).astimezone(UTC)


@dataclass(slots=True)
class PollResult:
    fetched: int = 0
    inserted: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)
    published: int = 0
    reconciled: bool = False
    new_indices: list[int] = field(default_factory=list)


@dataclass(slots=True)
class PollerState:
    last_day: date | None = None
    last_reconcile: datetime | None = None
    failures: int = 0
    raw_hashes: dict[int, bytes] = field(default_factory=dict)
    companies_day: date | None = None
    companies: repo.CompanyIndex | None = None


class KapPoller:
    def __init__(
        self,
        *,
        pool: Any,
        client: KapClient,
        cfg: PollConfig,
        redis: Any = None,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.pool = pool
        self.client = client
        self.cfg = cfg
        self.redis = redis
        self.now = now
        self.state = PollerState()

    def days_to_query(self, today: date) -> list[date]:
        last = self.state.last_day
        if last is not None and last < today:
            return [last, today]
        return [today]

    async def refresh_companies(self, conn: Any, today: date) -> repo.CompanyIndex:
        """KAP member list once per day (one request), then the in-memory issuer index."""
        if self.state.companies is not None and self.state.companies_day == today:
            return self.state.companies
        items = await self.client.company_items("IGS")
        await conn.commit()
        async with conn.transaction():
            stored = await repo.upsert_companies(conn, items, today)
        log.info("kap members refreshed: %d issuers", stored)
        self.state.companies = await repo.load_company_index(conn)
        self.state.companies_day = today
        return self.state.companies

    async def poll_once(self) -> PollResult:
        now = self.now()
        today = istanbul_day(now)
        days = self.days_to_query(today)
        reconcile = self.state.last_reconcile is None or now - self.state.last_reconcile >= RECONCILE_EVERY
        raw_rows: list[dict[str, Any]] = []
        for day in days:
            raw_rows.extend(await self.client.list_main(day, day))
        rows, errors = normalize_rows(raw_rows, source="live", seen_at=now)
        result = PollResult(fetched=len(rows), errors=errors, reconciled=reconcile)
        for err in errors:
            log.warning("kap row skipped: %s", err)
        async with self.pool.connection() as conn:
            companies = await self.refresh_companies(conn, today)
            await conn.commit()  # close the read transaction: the store below is a real transaction
            async with conn.transaction():
                await self._store(conn, rows, companies, today, reconcile, result)
            if result.new_indices and not self.cfg.demo_mode and self.redis is not None:
                result.published = await publish_new(conn, self.redis, result.new_indices, now)
            await conn.commit()
        self.state.last_day = today
        if reconcile:
            self.state.last_reconcile = now
        return result

    async def _store(
        self,
        conn: Any,
        rows: list[NormalizedDisclosure],
        companies: repo.CompanyIndex,
        today: date,
        reconcile: bool,
        result: PollResult,
    ) -> None:
        start = day_start_utc(today)
        if not self.cfg.demo_mode:
            await repo.hide_before(conn, start)
        cursor = await repo.max_kap_index(conn)
        for d in rows:
            behind = d.disclosure_index <= cursor
            if behind and not reconcile:
                continue
            row = replace(d, ingest_source="reconcile") if behind else d
            visible = not self.cfg.demo_mode and row.published_at >= start
            status = await repo.upsert_disclosure(conn, row, companies, visible=visible)
            setattr(result, status, getattr(result, status) + 1)
            digest = repo.payload_sha256(row.raw)
            if self.state.raw_hashes.get(row.disclosure_index) != digest:
                await repo.save_raw(conn, "kap.list_main", str(row.disclosure_index), row.raw)
                self.state.raw_hashes[row.disclosure_index] = digest
            if status != "inserted":
                continue
            result.new_indices.append(row.disclosure_index)
            if self.cfg.fetch_details and wants_detail(row.subject_route):
                await repo.enqueue_detail(conn, row.disclosure_index, LIVE_PRIORITY)
        if len(self.state.raw_hashes) > 20_000:  # keep only the last two days' worth
            for key in sorted(self.state.raw_hashes)[:10_000]:
                del self.state.raw_hashes[key]
