"""worker-scheduler (04 §scheduler, M3 B1): the market day's jobs on one Europe/Istanbul clock.

    uv run python -m kaptan.workers.scheduler                         # the loop (leader lock, heartbeat)
    uv run python -m kaptan.workers.scheduler list                    # the table below
    uv run python -m kaptan.workers.scheduler run eod_prices --day 2026-10-20

A small hand-written table (no cron library). Every TICK_S the loop asks, per job, "is a slot due and not
done yet?":
- a daily job's slot is its Istanbul day; it is due from its time on, on the days it runs (BIST trading
  days for market jobs, `prices/calendar.py`) and, for a chained job, once its predecessor finished that
  day. A finished `ops.job_runs` row for (job, slot) means done, so a restart later the same day catches a
  missed run up once (trigger `catchup`) and never runs it twice; a missed day is not replayed.
- an interval job's slot is the current Istanbul minute rounded down to its period (in-session jobs only
  between the open and the session close).
Each run gets its own pooled connection, a timeout and its own row (summary JSON, error class only); one
failing or hanging job never stops the others. A failed slot is not retried by the loop: run it by hand.

DEMO_MODE: only jobs marked demo-safe run (the nightly audit verify, which then writes no anchor); the
demo day keeps its seeded state. SSE: exits publish `approval.requested` per new exit card plus
`counters`; the risk monitor publishes `halt` / `kill_switch` itself; a regime change publishes `regime`.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import logging
import sys
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any, Final, Literal

import redis.asyncio as aioredis
from psycopg.types.json import Jsonb

from kaptan.api.loop import run
from kaptan.db import create_pool
from kaptan.ops.runtime import run_worker_process
from kaptan.prices.calendar import (
    IST,
    SESSION_OPEN,
    CalendarRangeError,
    is_trading_day,
    istanbul_date,
    session_close,
)
from kaptan.settings import ConfigError, Settings, get_settings

log = logging.getLogger("kaptan.workers.scheduler")

TICK_S: Final = 20.0
DEFAULT_TIMEOUT_S: Final = 15 * 60.0
XU100: Final = "XU100"
Days = Literal["daily", "trading", "weekdays", "monday"]
Trigger = Literal["schedule", "catchup", "manual"]


@dataclass(frozen=True, slots=True)
class Ctx:
    """What a job may use: settings, the pool, Redis (SSE) and the HTTP client factory."""

    settings: Settings
    pool: Any
    redis: Any
    http: Callable[[], Any]


JobFn = Callable[[Any, Ctx, date, datetime], Awaitable[Any]]


@dataclass(frozen=True, slots=True)
class Job:
    name: str
    fn: JobFn
    at: time | None = None  # daily jobs
    every_min: int | None = None  # interval jobs
    days: Days = "trading"
    in_session: bool = False
    after: str | None = None  # a daily job that waits for this one to finish the same day
    timeout_s: float = DEFAULT_TIMEOUT_S
    demo_safe: bool = False
    #: The job manages its own transaction (commits before publishing): the runner does not commit.
    own_tx: bool = False


# ── job bodies ────────────────────────────────────────────────────────────────


async def _polite(ctx: Ctx, body: Callable[[Any], Awaitable[Any]]) -> Any:
    from kaptan.prices.http import PoliteClient

    async with ctx.http() as http:
        return await body(PoliteClient(http, min_interval_s=ctx.settings.prices_min_interval_s))


async def _tickers(conn: Any, sql: str, params: Any = ()) -> list[str]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [str(r["ticker"]) for r in await cur.fetchall()]


HELD_SQL: Final = """
SELECT ticker FROM trading.positions WHERE qty > 0
UNION SELECT ticker FROM trading.orders WHERE status IN ('pending_open', 'accepted')
ORDER BY ticker
"""
EOD_TICKERS_SQL: Final = """
SELECT ticker FROM core.universe_daily WHERE d = %(day)s AND is_eligible
UNION SELECT ticker FROM trading.positions WHERE qty > 0
UNION SELECT ticker FROM trading.orders WHERE status IN ('pending_open', 'accepted')
ORDER BY ticker
"""


async def job_issuer_profiles(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.reference.profiles import run_issuer_profiles

    return await _polite(ctx, lambda c: run_issuer_profiles(conn, now, client=c))


async def job_market_changes(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.reference.profiles import sync_market_changes

    return await sync_market_changes(conn, now)


async def job_universe(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.reference.universe import run_universe

    return await run_universe(conn, day, now=now)


async def job_tedbir(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.reference.tedbir import run_tedbir_sync, spk_bulletin_source

    return await run_tedbir_sync(conn, now, bulletin=spk_bulletin_source(ctx.settings, clock=lambda: now))


async def job_morning_brief(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.brief.store import run_morning_brief

    return await run_morning_brief(conn, day, now, live_marks=ctx.settings.prices_live)


async def job_open_fill(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.brokers.fills import run_open_fill

    return await run_open_fill(conn, day)


async def job_risk_monitor(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.risk.monitor import run_risk_monitor

    result = await run_risk_monitor(conn, now, redis=ctx.redis)
    return {"ran": result.ran, "events": list(result.events)}


async def job_quotes(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.prices.intraday import refresh_quotes

    tickers = await _tickers(conn, HELD_SQL)
    if not tickers:
        return {"tickers": 0}
    return await _polite(ctx, lambda c: refresh_quotes(conn, tickers, now, client=c))


async def job_eod_prices(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    """`eod_prices` (18:30): the day's raw + adjusted bars and corporate actions (prices.ingest), per ticker
    of the day's universe, the held/pending tickers and XU100. A failing ticker is skipped and counted."""
    from kaptan.prices.http import SourceError
    from kaptan.prices.ingest import fetch_ticker, store_fetched

    tickers = sorted({*await _tickers(conn, EOD_TICKERS_SQL, {"day": day}), XU100})
    await conn.commit()

    async def body(client: Any) -> dict[str, Any]:
        stored, failed = 0, []
        for t in tickers:
            try:
                report = await store_fetched(conn, await fetch_ticker(client, t, day, day), now)
            except SourceError:
                failed.append(t)
                continue
            stored += report.raw_rows
        return {"tickers": len(tickers), "raw_rows": stored, "failed": failed}

    return await _polite(ctx, body)


async def job_eod_fills(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.brokers.fills import run_eod_fills

    return await run_eod_fills(conn, day)


async def job_exits(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    """X1–X6 after the close; new exit cards go out as SSE `approval.requested` + `counters` after commit."""
    from kaptan.disclosures.counters import day_counters
    from kaptan.events.publish import publish
    from kaptan.portfolio.exits import run_exits

    report = await run_exits(conn, day, now=now)
    await conn.commit()
    for card in report.cards:
        await publish(ctx.redis, "desk", "approval.requested", card)
    if report.cards:
        await publish(ctx.redis, "feed", "counters", await day_counters(conn, now))
        await conn.rollback()
    return {"cards": len(report.cards), "stops_moved": report.stops_moved, "skipped": len(report.skipped)}


async def job_pnl_eod(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.risk.pnl_eod import run_pnl_eod

    return {"rows": len(await run_pnl_eod(conn, day))}


async def job_regime(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    """06 §9 after the EOD prices; a change goes out as SSE desk `regime` (the new RiskStatus) after commit."""
    from kaptan.events.publish import publish
    from kaptan.risk.regime import run_regime
    from kaptan.risk.status import risk_status

    result = await run_regime(conn, day)
    if result is None:
        return None  # DEMO_MODE, not a session or no XU100 close: nothing written
    await conn.commit()
    if result.changed:
        status = await risk_status(conn, now, live=not ctx.settings.demo_mode)
        await conn.rollback()
        await publish(ctx.redis, "desk", "regime", status)
    return result


async def job_intraday_archive(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.prices.intraday import run_intraday_archive

    return await _polite(ctx, lambda c: run_intraday_archive(conn, day, client=c, now=now))


async def job_event_returns(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.reference.event_returns import run_event_returns

    return await run_event_returns(conn, day, now=now)


async def job_shadow_returns(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.portfolio.shadow import run_shadow_returns

    return await run_shadow_returns(conn, day, now=now)


async def job_fundamentals(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.fundamentals.store import run_fundamentals

    return await _polite(ctx, lambda c: run_fundamentals(conn, now, client=c))


async def job_dq(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.dq.run import run_dq

    results = await run_dq(conn, day, now=now)
    return {"checks": len(results), "failed": [r.code for r in results if not r.passed]}


async def job_audit_anchor(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.audit.anchor import anchor_chain

    path = Path(ctx.settings.audit_anchor_file) if ctx.settings.audit_anchor_file else None
    write = not ctx.settings.demo_mode
    report = await anchor_chain(conn, now, write=write, anchor_file=path if write else None, redis=ctx.redis)
    return report


async def job_retention(conn: Any, ctx: Ctx, day: date, now: datetime) -> Any:
    from kaptan.dq.retention import run_retention

    return await run_retention(conn, now, job_runs_keep_days=ctx.settings.job_runs_keep_days)


#: The day, Europe/Istanbul (README "Scheduler"). Order matters only for readability.
JOBS: Final[tuple[Job, ...]] = (
    Job("issuer_profiles", job_issuer_profiles, at=time(7, 30), days="monday", timeout_s=30 * 60),
    Job("market_changes", job_market_changes, at=time(8, 20), days="daily", timeout_s=5 * 60),
    Job("universe", job_universe, at=time(8, 30), days="trading", timeout_s=10 * 60),
    Job("tedbir_sync", job_tedbir, every_min=30, days="daily", timeout_s=10 * 60),
    Job("morning_brief", job_morning_brief, at=time(8, 45), days="trading", timeout_s=5 * 60),
    Job("open_fill", job_open_fill, at=time(10, 16), days="trading", timeout_s=10 * 60),
    Job("risk_monitor", job_risk_monitor, every_min=5, in_session=True, timeout_s=4 * 60, own_tx=True),
    Job("quotes", job_quotes, every_min=4, in_session=True, timeout_s=3 * 60),
    Job("eod_prices", job_eod_prices, at=time(18, 30), days="trading", timeout_s=60 * 60),
    #: brokers.fills.run_eod_fills: "after the 18:30 EOD prices" (needs the session close).
    Job("eod_fills", job_eod_fills, at=time(18, 30), days="trading", after="eod_prices", timeout_s=10 * 60),
    Job("exits", job_exits, at=time(18, 30), days="trading", after="eod_fills", timeout_s=10 * 60, own_tx=True),
    Job("pnl_eod", job_pnl_eod, at=time(18, 45), days="trading", after="exits", timeout_s=10 * 60),
    Job("regime", job_regime, at=time(18, 45), days="trading", after="pnl_eod", timeout_s=5 * 60, own_tx=True),
    Job("intraday_archive", job_intraday_archive, at=time(19, 0), days="trading", timeout_s=60 * 60),
    Job("event_returns", job_event_returns, at=time(20, 0), days="trading", timeout_s=30 * 60),
    Job("shadow_returns", job_shadow_returns, at=time(20, 15), days="trading", timeout_s=10 * 60),
    Job("fundamentals", job_fundamentals, at=time(20, 30), days="trading", timeout_s=60 * 60),
    Job("dq", job_dq, at=time(21, 0), days="trading", timeout_s=15 * 60),
    Job("audit_anchor", job_audit_anchor, at=time(23, 30), days="daily", timeout_s=10 * 60, demo_safe=True),
    Job("retention", job_retention, at=time(3, 30), days="daily", timeout_s=30 * 60),
)
BY_NAME: Final = {j.name: j for j in JOBS}


# ── when is a slot due ────────────────────────────────────────────────────────


def _trading(d: date) -> bool:
    try:
        return is_trading_day(d)
    except CalendarRangeError:
        return d.weekday() < 5


def runs_on(job: Job, d: date) -> bool:
    if job.days == "daily":
        return True
    if job.days == "monday":
        return d.weekday() == 0
    if job.days == "weekdays":
        return d.weekday() < 5
    return _trading(d)


def in_session(now: datetime) -> bool:
    local = now.astimezone(IST)
    d = local.date()
    if not _trading(d):
        return False
    return datetime.combine(d, SESSION_OPEN, IST) <= local < session_close(d)


def slot_of(job: Job, now: datetime) -> str | None:
    """The slot due at `now` (None: nothing to run now). Daily = "YYYY-MM-DD"; interval = "YYYY-MM-DDTHH:MM"."""
    local = now.astimezone(IST)
    d = local.date()
    if job.every_min is not None:
        if job.in_session and not in_session(now):
            return None
        if not job.in_session and not runs_on(job, d):
            return None
        minute = (local.hour * 60 + local.minute) // job.every_min * job.every_min
        return f"{d.isoformat()}T{minute // 60:02d}:{minute % 60:02d}"
    if job.at is None or not runs_on(job, d) or local.time() < job.at:
        return None
    return d.isoformat()


def slot_time(job: Job, slot: str) -> datetime:
    """The nominal start of a slot (to tell a timely run from a catch-up)."""
    if "T" in slot:
        return datetime.fromisoformat(slot).replace(tzinfo=IST)
    assert job.at is not None
    return datetime.combine(date.fromisoformat(slot), job.at, IST)


def trigger_for(job: Job, slot: str, now: datetime, grace: timedelta = timedelta(minutes=10)) -> Trigger:
    return "catchup" if now - slot_time(job, slot) > grace and job.after is None else "schedule"


def due(now: datetime, done: set[tuple[str, str]], running: set[str], *, demo: bool) -> list[tuple[Job, str]]:
    """The (job, slot) pairs to start at `now`: slot due, not done, not running, predecessor done."""
    out: list[tuple[Job, str]] = []
    for job in JOBS:
        if demo and not job.demo_safe:
            continue
        if job.name in running:
            continue
        slot = slot_of(job, now)
        if slot is None or (job.name, slot) in done:
            continue
        if job.after is not None and (job.after, slot) not in done:
            continue
        out.append((job, slot))
    return out


# ── the run log (ops.job_runs) ────────────────────────────────────────────────

START_SQL: Final = """
INSERT INTO ops.job_runs (job, slot, trigger, started_at) VALUES (%s, %s, %s, %s) RETURNING id
"""
FINISH_SQL: Final = """
UPDATE ops.job_runs SET finished_at = %s, ok = %s, summary = %s, error_class = %s WHERE id = %s
"""
DONE_SQL: Final = """
SELECT DISTINCT job, slot FROM ops.job_runs WHERE finished_at IS NOT NULL AND slot >= %s
"""


def jsonable(x: Any) -> Any:
    """A job's result as small JSON (dataclasses, dates, Decimals → plain values)."""
    if is_dataclass(x) and not isinstance(x, type):
        return {k: jsonable(v) for k, v in asdict(x).items()}
    if isinstance(x, list | tuple | set | frozenset):
        return [jsonable(v) for v in x]
    if isinstance(x, dict):
        return {str(k): jsonable(v) for k, v in x.items()}
    if isinstance(x, Decimal):
        return float(x)
    if isinstance(x, date | datetime):
        return x.isoformat()
    return x if isinstance(x, int | float | str | bool) or x is None else str(x)


def compact(summary: Any, limit: int = 8000) -> dict[str, Any]:
    doc = jsonable(summary)
    doc = doc if isinstance(doc, dict) else {"result": doc}
    if len(json.dumps(doc, ensure_ascii=False)) > limit:
        return {"truncated": True, "keys": sorted(doc)[:50]}
    return doc


async def done_slots(pool: Any, now: datetime) -> set[tuple[str, str]]:
    since = (now.astimezone(IST).date() - timedelta(days=1)).isoformat()
    async with pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(DONE_SQL, (since,))
        return {(str(r["job"]), str(r["slot"])) for r in await cur.fetchall()}


@dataclass(slots=True)
class RunResult:
    job: str
    slot: str
    ok: bool
    summary: dict[str, Any] = field(default_factory=dict)
    error_class: str | None = None


async def run_job(
    ctx: Ctx, job: Job, slot: str, *, trigger: Trigger, now: datetime | None = None, day: date | None = None
) -> RunResult:
    """Run one job with its timeout, recording start and finish in ops.job_runs. Never raises (except
    cancellation): a failure is logged with its class and stored as ok = false."""
    started = now or datetime.now(UTC)
    run_day = day or (date.fromisoformat(slot[:10]))
    async with ctx.pool.connection() as conn:
        cur = await conn.execute(START_SQL, (job.name, slot, trigger, datetime.now(UTC)))
        row = await cur.fetchone()
        run_id = int(row["id"])
        await conn.commit()
    result = RunResult(job.name, slot, ok=False)
    try:
        async with ctx.pool.connection() as conn:
            summary = await asyncio.wait_for(job.fn(conn, ctx, run_day, started), timeout=job.timeout_s)
            if not job.own_tx:
                await conn.commit()
        result.ok, result.summary = True, compact(summary)
        log.info("job %s [%s] ok", job.name, slot)
    except asyncio.CancelledError:
        result.error_class = "CancelledError"
        await _finish(ctx, run_id, result)
        raise
    except Exception as exc:  # one job's failure must never stop the scheduler or the others
        result.error_class = type(exc).__name__
        log.error("job %s [%s] failed: %s", job.name, slot, result.error_class)
    await _finish(ctx, run_id, result)
    return result


async def _finish(ctx: Ctx, run_id: int, result: RunResult) -> None:
    try:
        async with ctx.pool.connection() as conn:
            await conn.execute(
                FINISH_SQL, (datetime.now(UTC), result.ok, Jsonb(result.summary), result.error_class, run_id)
            )
            await conn.commit()
    except Exception as exc:
        log.error("job %s: run log not updated: %s", result.job, type(exc).__name__)


# ── the loop ──────────────────────────────────────────────────────────────────


async def tick(
    ctx: Ctx, now: datetime, running: dict[str, asyncio.Task[RunResult]], *, demo: bool
) -> list[tuple[Job, str]]:
    """Start every due job as its own task; returns what was started."""
    for name in [n for n, t in running.items() if t.done()]:
        running.pop(name)
    started = due(now, await done_slots(ctx.pool, now), set(running), demo=demo)
    for job, slot in started:
        trig = trigger_for(job, slot, now)
        running[job.name] = asyncio.create_task(run_job(ctx, job, slot, trigger=trig), name=f"job-{job.name}")
    return started


async def _wait(stop: asyncio.Event, seconds: float) -> None:
    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(stop.wait(), timeout=seconds)


def make_ctx(settings: Settings, pool: Any, redis: Any) -> Ctx:
    from kaptan.prices.http import make_http_client

    return Ctx(settings=settings, pool=pool, redis=redis, http=make_http_client)


async def run_worker(settings: Settings, stop: asyncio.Event | None = None) -> int:
    """The scheduler loop until `stop`; jobs in flight finish (or hit their timeout / the drain timeout)."""
    stop = stop or asyncio.Event()
    if settings.demo_mode:
        log.warning("DEMO_MODE=true: only demo-safe jobs run (%s)", ", ".join(j.name for j in JOBS if j.demo_safe))
    pool = create_pool(settings.database_url.get_secret_value(), min_size=1, max_size=6)
    await pool.open(wait=True)
    redis = aioredis.from_url(settings.redis_url.get_secret_value(), decode_responses=True)
    ctx = make_ctx(settings, pool, redis)
    running: dict[str, asyncio.Task[RunResult]] = {}
    try:
        log.info("scheduler started: %d jobs, Europe/Istanbul", len(JOBS))
        while not stop.is_set():
            try:
                await tick(ctx, datetime.now(UTC), running, demo=settings.demo_mode)
            except Exception as exc:  # the database may be away for a moment: try again next tick
                log.warning("scheduler tick failed: %s", type(exc).__name__)
            await _wait(stop, TICK_S)
        if running:
            log.info("draining %d running job(s)", len(running))
            await asyncio.gather(*running.values(), return_exceptions=True)
    finally:
        for task in running.values():
            task.cancel()
        await asyncio.gather(*running.values(), return_exceptions=True)
        await redis.aclose()
        await pool.close()
    return 0


# ── CLI ───────────────────────────────────────────────────────────────────────


def describe(job: Job) -> str:
    when = f"{job.at:%H:%M}" if job.at else f"every {job.every_min} min"
    scope = "in session" if job.in_session else job.days
    extra = f", after {job.after}" if job.after else ""
    demo = ", demo-safe" if job.demo_safe else ""
    return f"{job.name:18s} {when:14s} {scope}{extra}{demo}"


async def run_one(settings: Settings, name: str, day: date | None) -> RunResult:
    job = BY_NAME[name]
    now = datetime.now(UTC)
    run_day = day or istanbul_date(now)
    if day is not None and day != istanbul_date(now):
        now = datetime.combine(day, job.at or time(12, 0), IST)  # the job's own time on that day
    pool = create_pool(settings.database_url.get_secret_value(), min_size=1, max_size=3)
    await pool.open(wait=True)
    redis = aioredis.from_url(settings.redis_url.get_secret_value(), decode_responses=True)
    try:
        slot = run_day.isoformat() if job.every_min is None else f"{run_day.isoformat()}T{now.astimezone(IST):%H:%M}"
        return await run_job(make_ctx(settings, pool, redis), job, slot, trigger="manual", now=now, day=run_day)
    finally:
        await redis.aclose()
        await pool.close()


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m kaptan.workers.scheduler", description="KAPtan scheduler")
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("list", help="show the job table")
    r = sub.add_parser("run", help="run one job now (recorded as trigger=manual)")
    r.add_argument("job", choices=sorted(BY_NAME))
    r.add_argument("--day", type=date.fromisoformat, default=None, help="YYYY-MM-DD (default: today, Istanbul)")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if args.cmd is None:
        return run_worker_process("scheduler", run_worker)
    if args.cmd == "list":
        for job in JOBS:
            print(describe(job))
        return 0
    try:
        settings = get_settings()
    except ConfigError as exc:
        print(exc, file=sys.stderr)
        return 2
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    if settings.demo_mode and not BY_NAME[args.job].demo_safe:
        print(f"{args.job}: DEMO_MODE=true, this job does not run on a demo database", file=sys.stderr)
        return 2
    result = run(run_one(settings, args.job, args.day))
    print(json.dumps(jsonable(result), ensure_ascii=False, indent=1))
    return 0 if result.ok else 1


if __name__ == "__main__":
    sys.exit(main())
