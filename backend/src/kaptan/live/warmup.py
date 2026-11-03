"""Live warm-up: the first start of the system gets real recent data before the agents run.

    docker compose up -d                                         # the `warmup` service asks every hour:
    python -m kaptan.live.warmup --if-needed                     #   first install, or missed market days?
    uv run python -m kaptan.live.warmup [--days 5] [--max-tickers 300]

Idempotent and resumable (a second run only fills what is missing). Steps, all polite (one request at a
time, ≥ PRICES_MIN_INTERVAL_S / KAP_MIN_INTERVAL_S apart):

1. **KAP history** — the member list, then `byCriteria` for the LIVE_BACKFILL_DAYS days before today
   (`ingest_source='backfill'`, never in the live feed; today's rows come from the ingest worker).
2. **Issuers** — İş Yatırım's stock list (one page): sector + name per share (core.issuer_profiles), and the
   market cap × free float of every share. Only shares above the universe's U4 floor can ever be eligible,
   so only those (largest first, at most LIVE_WARMUP_MAX_TICKERS; shares with a recent agent-route
   disclosure go first) get their ~14 months of İş Yatırım daily bars — one request each — which the
   universe's U2 (20-session turnover) and U5 (250 sessions of history) need. XU100 comes from Yahoo.
3. **Jobs** of the scheduler, recorded in ops.job_runs: market_changes, tedbir_sync, the universe of the
   next session to trade, pnl_eod for the last few sessions (the paper book starts flat at PAPER_CAPITAL_TRY:
   the equity line shows cash until the first fill), regime and the morning brief.

A source that fails is logged and skipped (exit 0): the scheduler's daily jobs fill it in later. Without
KAP_LIVE=true it does nothing (exit 0).

`--if-needed` makes it safe at every restart: a plain restart with fresh prices does nothing and touches no
source. It runs only on a first install or after market days the PC was off for (the scheduler does not
replay a missed day), at most once per WARMUP_COOLDOWN, and leaves a `live_warmup` row in ops.job_runs
that `agent_worker` waits for and the panel's status reads.
"""

from __future__ import annotations

import argparse
import html
import logging
import re
import sys
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Final

from kaptan.ingest.subject_routes import DETAIL_ROUTES
from kaptan.prices.calendar import (
    IST,
    close_known_at,
    is_trading_day,
    istanbul_date,
    next_session,
    prev_session,
    session_close,
)
from kaptan.prices.http import SourceError
from kaptan.prices.ingest import Fetched, Source, store_fetched
from kaptan.reference.profiles import UPSERT_PROFILE_SQL
from kaptan.reference.rules import UNIVERSE_PARAMS
from kaptan.settings import ConfigError, Settings, get_settings
from kaptan.text.turkish import clean_text

log = logging.getLogger("kaptan.live.warmup")

XU100: Final = "XU100"
#: U5 needs 250 sessions before the universe day; ~14 months of calendar days hold ~280.
HISTORY_DAYS: Final = 420
#: One İş Yatırım request for the whole window (the endpoint answers it; checked 2026-10-30).
ONE_REQUEST_DAYS: Final = HISTORY_DAYS + 30
MIN_SESSIONS: Final = UNIVERSE_PARAMS.history_min_sessions
MILLION: Final = Decimal(1_000_000)
#: Failing sources are not asked again for this long, however often the machine restarts.
WARMUP_COOLDOWN: Final = timedelta(hours=6)
#: `eod_prices` starts at 18:30 and may run for a while: a day counts as missed only this long after its close.
EOD_GRACE: Final = timedelta(hours=3)
MAX_CATCH_UP_DAYS: Final = 30

#: İş Yatırım "Temel Değerler ve Oranlar", first table: Kod | Ad | Sektör | Kapanış | Piyasa Değeri (mn TL) |
#: Piyasa Değeri (mn $) | Halka Açıklık (%) | Sermaye (mn TL).
STOCK_ROW_RE: Final = re.compile(
    r"hisse=(?P<code>[A-Z0-9]{3,8})\"[^>]*>[^<]*</a>\s*</td>\s*<td>(?P<name>[^<]*)</td>\s*<td>(?P<sector>[^<]*)</td>"
    r"\s*<td[^>]*>(?P<close>[^<]*)</td>\s*<td[^>]*>(?P<mcap>[^<]*)</td>\s*<td[^>]*>[^<]*</td>"
    r"\s*<td[^>]*>(?P<ff>[^<]*)</td>"
)
PRIORITY_SQL: Final = """
SELECT DISTINCT primary_ticker AS ticker FROM core.disclosures
 WHERE origin = 'kap' AND primary_ticker IS NOT NULL AND subject_route = ANY(%s) AND published_at >= %s
"""
HISTORY_SQL: Final = """
SELECT ticker, count(DISTINCT d) AS n, max(d) AS last_d FROM core.prices_daily
 WHERE ticker = ANY(%s) AND source = 'isyatirim' AND price_basis = 'raw' AND d < %s
 GROUP BY ticker
"""


@dataclass(frozen=True, slots=True)
class StockRow:
    ticker: str
    name: str
    sector: str
    close: Decimal | None
    mcap_try: Decimal | None
    free_float_pct: Decimal | None

    @property
    def ff_mcap_try(self) -> Decimal | None:
        if self.mcap_try is None or self.free_float_pct is None:
            return None
        return self.mcap_try * self.free_float_pct / 100


def tr_number(text: str) -> Decimal | None:
    """ "334.236,0" → Decimal("334236.0"); blanks and dashes → None."""
    raw = text.strip().replace(".", "").replace(",", ".")
    if raw in ("", "-"):
        return None
    try:
        out = Decimal(raw)
    except InvalidOperation:
        return None
    return out if out.is_finite() else None


def parse_stock_table(page: str) -> list[StockRow]:
    """The stock list page → one row per share code (first occurrence wins)."""
    out: dict[str, StockRow] = {}
    for m in STOCK_ROW_RE.finditer(page):
        code = m.group("code")
        if code in out:
            continue
        mcap = tr_number(m.group("mcap"))
        out[code] = StockRow(
            ticker=code,
            name=clean_text(html.unescape(m.group("name"))),
            sector=clean_text(html.unescape(m.group("sector"))),
            close=tr_number(m.group("close")),
            mcap_try=None if mcap is None else mcap * MILLION,
            free_float_pct=tr_number(m.group("ff")),
        )
    return list(out.values())


def pick_candidates(
    rows: Sequence[StockRow], priority: set[str], *, floor: Decimal = UNIVERSE_PARAMS.ff_mcap_min_try, limit: int
) -> list[str]:
    """Shares that can pass U4, priority codes first, then by free-float market cap (largest first)."""
    able = [r for r in rows if (r.ff_mcap_try or Decimal(0)) >= floor]
    able.sort(key=lambda r: (r.ticker not in priority, -(r.ff_mcap_try or Decimal(0)), r.ticker))
    return [r.ticker for r in able[: max(0, limit)]]


def universe_day(now: datetime) -> date:
    """The session the agents trade next: today before its close, else the next session."""
    today = istanbul_date(now)
    if is_trading_day(today) and now < session_close(today):
        return today
    return next_session(today)


def last_closed_session(now: datetime) -> date:
    """The latest session whose EOD prices are out (18:30 Istanbul)."""
    today = istanbul_date(now)
    if is_trading_day(today) and now >= close_known_at(today):
        return today
    return prev_session(today)


def recent_sessions(last: date, n: int) -> list[date]:
    """`n` sessions ending with `last`, oldest first."""
    out = [last] if n > 0 else []
    while len(out) < n:
        out.insert(0, prev_session(out[0]))
    return out


async def _rows(conn: Any, sql: str, params: Any) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


async def priority_tickers(conn: Any, since: datetime) -> set[str]:
    return {str(r["ticker"]) for r in await _rows(conn, PRIORITY_SQL, (sorted(DETAIL_ROUTES), since))}


async def history_gaps(conn: Any, tickers: Sequence[str], day: date) -> list[str]:
    """The tickers (in the given order) without MIN_SESSIONS bars before `day` or without the last session."""
    have = {str(r["ticker"]): r for r in await _rows(conn, HISTORY_SQL, (list(tickers), day))}
    latest = prev_session(day)
    out = []
    for t in tickers:
        r = have.get(t)
        if r is None or int(r["n"]) < MIN_SESSIONS or r["last_d"] < latest:
            out.append(t)
    return out


Fetch = Callable[[str, date, date, tuple[Source, ...]], Awaitable[Fetched]]


@dataclass(slots=True)
class PriceReport:
    fetched: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    rows: int = 0


async def warm_prices(
    conn: Any, fetch: Fetch, tickers: Sequence[str], start: date, end: date, now: datetime
) -> PriceReport:
    """İş Yatırım bars per share (XU100: Yahoo), committed per ticker so a stop keeps what was loaded."""
    rep = PriceReport()
    for i, t in enumerate(tickers, 1):
        sources: tuple[Source, ...] = ("yfinance",) if t == XU100 else ("isyatirim",)
        try:
            report = await store_fetched(conn, await fetch(t, start, end, sources), now)
        except SourceError as exc:
            log.warning("prices %s: %s", t, exc)
            rep.failed.append(t)
            continue
        await conn.commit()
        rep.fetched.append(t)
        rep.rows += report.raw_rows + report.adjusted_rows
        if i % 25 == 0:
            log.info("prices: %d/%d tickers loaded", i, len(tickers))
    return rep


@dataclass(frozen=True, slots=True)
class Sources:
    """The network sides of the warm-up (fakes in tests)."""

    stock_page: Callable[[], Awaitable[str | None]]
    fetch: Fetch
    kap_backfill: Callable[[date, date], Awaitable[dict[str, Any]]]


JobRunner = Callable[[str, date, datetime], Awaitable[bool]]


@dataclass(slots=True)
class WarmupReport:
    kap: dict[str, Any] = field(default_factory=dict)
    profiles: int = 0
    candidates: int = 0
    prices: PriceReport = field(default_factory=PriceReport)
    jobs: dict[str, bool] = field(default_factory=dict)
    universe_day: date | None = None
    eligible: int = 0


async def _kap(sources: Sources, today: date, days: int) -> dict[str, Any]:
    if days <= 0:
        return {"days": 0}
    try:
        return await sources.kap_backfill(today - timedelta(days=days), today - timedelta(days=1))
    except Exception as exc:  # KAP's WAF or a timeout: the live poller still runs; rerun the warm-up later
        log.warning("KAP history skipped: %s: %s", type(exc).__name__, exc)
        return {"error": type(exc).__name__}


async def _stock_rows(conn: Any, sources: Sources, now: datetime) -> list[StockRow]:
    try:
        page = await sources.stock_page()
    except SourceError as exc:
        log.warning("İş Yatırım stock list failed: %s", exc)
        return []
    rows = parse_stock_table(page or "")
    if not rows:
        log.warning("İş Yatırım stock list: no rows parsed (page layout changed?)")
        return []
    params = [(r.ticker, r.name, r.sector, now) for r in rows if r.sector]
    async with conn.cursor() as cur:
        await cur.executemany(UPSERT_PROFILE_SQL, params)
    await conn.commit()
    return rows


async def run_warmup(
    pool: Any, sources: Sources, run_job: JobRunner, *, now: datetime, days: int, max_tickers: int
) -> WarmupReport:
    rep = WarmupReport()
    today = istanbul_date(now)
    rep.kap = await _kap(sources, today, days)
    trade_day = universe_day(now)
    last = last_closed_session(now)
    rep.universe_day = trade_day
    async with pool.connection() as conn:
        rows = await _stock_rows(conn, sources, now)
        rep.profiles = len(rows)
        since = datetime.combine(today - timedelta(days=max(days, 1)), time(0, 0), IST)
        priority = await priority_tickers(conn, since)
        picked = pick_candidates(rows, priority, limit=max_tickers)
        rep.candidates = len(picked)
        todo = [*await history_gaps(conn, picked, trade_day), XU100]
        await conn.commit()
        log.info("prices: %d of %d candidate shares need history (+ XU100)", len(todo) - 1, len(picked))
        rep.prices = await warm_prices(conn, sources.fetch, todo, last - timedelta(days=HISTORY_DAYS), last, now)
    for name, day in [
        ("market_changes", today),
        ("tedbir_sync", today),
        ("universe", trade_day),
        *[("pnl_eod", d) for d in recent_sessions(last, max(days, 1))],
        ("regime", last),
        ("morning_brief", today),
    ]:
        rep.jobs[f"{name}:{day}"] = await run_job(name, day, now)
    async with pool.connection() as conn:
        found = await _rows(
            conn, "SELECT count(*) AS n FROM core.universe_daily WHERE d = %s AND is_eligible", (trade_day,)
        )
        rep.eligible = int(found[0]["n"])
    log.info(
        "warm-up done: KAP %s · %d profiles · %d candidates · prices %d ok / %d failed · universe %s: %d eligible",
        rep.kap,
        rep.profiles,
        rep.candidates,
        len(rep.prices.fetched),
        len(rep.prices.failed),
        trade_day,
        rep.eligible,
    )
    return rep


def warmup_reason(
    now: datetime, *, last_attempt: datetime | None, has_universe: bool, latest_bar: date | None
) -> str | None:
    """Why this start should warm up (None = it should not)."""
    if last_attempt is not None and now - last_attempt < WARMUP_COOLDOWN:
        return None
    if not has_universe or latest_bar is None:
        return "first"
    return "missed_sessions" if latest_bar < last_closed_session(now - EOD_GRACE) else None


def catch_up_days(days: int, now: datetime, latest_bar: date | None) -> int:
    """KAP history to load: the configured days, or the whole time the PC was off (within the limit)."""
    if latest_bar is None:
        return days
    return max(days, min((istanbul_date(now) - latest_bar).days, MAX_CATCH_UP_DAYS))


# ── wiring (network + scheduler jobs) ─────────────────────────────────────────


def scheduler_job_runner(ctx: Any) -> JobRunner:
    from kaptan.workers import scheduler

    async def run(name: str, day: date, now: datetime) -> bool:
        job = scheduler.BY_NAME[name]
        at = now if day == istanbul_date(now) else datetime.combine(day, job.at or time(12, 0), IST)
        slot = day.isoformat() if job.every_min is None else f"{day.isoformat()}T{at.astimezone(IST):%H:%M}"
        result = await scheduler.run_job(ctx, job, slot, trigger="manual", now=at, day=day)
        return result.ok

    return run


async def _main(settings: Settings, days: int, max_tickers: int) -> int:  # pragma: no cover - network wiring
    import redis.asyncio as aioredis

    from kaptan.db import create_pool
    from kaptan.ingest.kap_backfill import backfill, refresh_members
    from kaptan.ingest.kap_client import KapClient
    from kaptan.prices.http import PoliteClient, make_http_client
    from kaptan.prices.ingest import fetch_ticker
    from kaptan.reference.profiles import LIST_URL
    from kaptan.workers.scheduler import make_ctx

    now = datetime.now(UTC)
    pool = create_pool(settings.database_url.get_secret_value(), min_size=1, max_size=4)
    await pool.open(wait=True)
    redis = aioredis.from_url(settings.redis_url.get_secret_value(), decode_responses=True)
    try:
        async with make_http_client() as http, KapClient.from_settings(settings) as kap:
            polite = PoliteClient(http, min_interval_s=settings.prices_min_interval_s)

            async def kap_backfill(start: date, end: date) -> dict[str, Any]:
                companies = await refresh_members(pool, kap, istanbul_date(now))
                r = await backfill(pool, kap, start, end, companies=companies)
                return {"days": r.days, "rows": r.rows, "inserted": r.inserted, "failed": r.failed_days}

            async def fetch(t: str, start: date, end: date, sources: tuple[Source, ...]) -> Fetched:
                return await fetch_ticker(polite, t, start, end, sources, chunk_days=ONE_REQUEST_DAYS)

            sources = Sources(stock_page=lambda: polite.get_text(LIST_URL), fetch=fetch, kap_backfill=kap_backfill)
            ctx = make_ctx(settings, pool, redis)
            await run_warmup(pool, sources, scheduler_job_runner(ctx), now=now, days=days, max_tickers=max_tickers)
    finally:
        await redis.aclose()
        await pool.close()
    return 0


STATE_SQL: Final = """
SELECT (SELECT max(started_at) FROM ops.job_runs WHERE job = 'live_warmup') AS last_attempt,
       EXISTS (SELECT 1 FROM core.universe_daily) AS has_universe,
       (SELECT max(d) FROM core.prices_daily) AS latest_bar
"""


async def _if_needed(settings: Settings, days: int, tickers: int) -> int:  # pragma: no cover - network wiring
    from psycopg.types.json import Jsonb

    from kaptan.db import connect
    from kaptan.workers.scheduler import FINISH_SQL, START_SQL

    now = datetime.now(UTC)
    conn = await connect(settings.database_url.get_secret_value(), autocommit=True)
    try:
        state = (await _rows(conn, STATE_SQL, None))[0]
        reason = warmup_reason(
            now, last_attempt=state["last_attempt"], has_universe=state["has_universe"], latest_bar=state["latest_bar"]
        )
        if reason is None:
            log.info("warm-up not needed")
            return 0
        log.info("warm-up starts: %s", reason)
        slot = istanbul_date(now).isoformat()
        run_id = (await _rows(conn, START_SQL, ("live_warmup", slot, "manual", now)))[0]["id"]
        code = await _main(settings, catch_up_days(days, now, state["latest_bar"]), tickers)
        await conn.execute(FINISH_SQL, (datetime.now(UTC), code == 0, Jsonb({"reason": reason}), None, run_id))
        return code
    finally:
        await conn.close()


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m kaptan.live.warmup", description="Live stack warm-up")
    p.add_argument("--if-needed", action="store_true", help="only on a first install or after missed market days")
    p.add_argument("--days", type=int, default=None, help="KAP history days before today (LIVE_BACKFILL_DAYS)")
    p.add_argument("--max-tickers", type=int, default=None, help="price history shares (LIVE_WARMUP_MAX_TICKERS)")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        settings = get_settings()
    except ConfigError as exc:
        print(f"warmup: {exc}", file=sys.stderr)
        return 2
    if not settings.kap_live:
        print("warmup: skipped (needs KAP_LIVE=true)", file=sys.stderr)
        return 0
    from kaptan.api.loop import run

    days = settings.live_backfill_days if args.days is None else max(0, min(args.days, 30))
    tickers = settings.live_warmup_max_tickers if args.max_tickers is None else max(0, args.max_tickers)
    return run(_if_needed(settings, days, tickers) if args.if_needed else _main(settings, days, tickers))


if __name__ == "__main__":
    sys.exit(main())
