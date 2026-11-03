"""`event_returns` (04 §4.1, weekdays 20:00): materialised abnormal returns per event (FR-12, 07 P2).

    stats = await run_event_returns(conn, date(2026, 10, 20))

1. `core.events` gets one row per real KAP E1–E4 disclosure (the same set the evidence tools study,
   `kaptan.evidence.holdout`), `classifier` `rule:<subject map version>` or `llm:classification`, `t0_session` =
   the entry session (P5).
2. For every event, each horizon h ∈ {1, 5, 20, 60} whose window closed before the job time (`as_of` =
   `day` 20:00 Istanbul) and is not stored yet is computed with the evidence package's own study code
   (`kaptan.evidence.study`: estimation window, market model or market-adjusted fallback, CAR[1,h])
   and stored in `core.event_returns` with `available_at` = the close of the horizon's last session
   (18:30, 13:00 on half days): `t_end` = t0 + h − 1. `raw_ret` / `bench_ret` are the summed daily
   returns of the stock / XU100 over the same sessions (CAR = raw − (α + β·bench) summed).
3. Readers use `available_at < as_of` (`kaptan.evidence.repo.materialised_cars`); notebooks read the
   holdout-hiding view `core.event_returns_dev` (07 P7).
4. The holdout window stays unmaterialised until its one run finished (12 §1): no reader can see what is not stored.

Idempotent: stored (event, horizon, model) rows are never recomputed; an event whose every window closed is settled
(`returns_settled_at`) and not retried, so events without prices do not cost every night's job a pass.
`run_archive_returns` is the same work per company, committed per company, for the whole archive.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Any, Final

from kaptan.evidence import repo
from kaptan.evidence.holdout import E_CODES, EVENT_ROW_SQL, unsealed_sql
from kaptan.evidence.params import ESTIMATION_WINDOW
from kaptan.evidence.sessions import entry_session, event_session, last_known_session
from kaptan.evidence.study import (
    MarketModel,
    Series,
    close_return,
    entry_return,
    estimation_days,
    event_cars,
    fit_market_model,
    window_closed,
)
from kaptan.prices.calendar import FIRST_YEAR, IST, CalendarRangeError, add_sessions, close_known_at
from kaptan.reference._sql import Conn, execute, execute_many, fetch_all

log = logging.getLogger("kaptan.reference.event_returns")

HORIZONS: Final = (1, 5, 20, 60)
JOB_TIME: Final = time(20, 0)
MAX_EVENTS_PER_RUN: Final = 5000
ARCHIVE_EVENTS_PER_TICKER: Final = 20_000

NEW_EVENTS_SQL: Final = f"""
SELECT d.disclosure_index, d.primary_ticker AS ticker, d.published_at, d.available_at, d.subject_map_version,
       CASE WHEN d.subject_route = ANY(%(codes)s::text[]) THEN d.subject_route
            ELSE d.classification ->> 'event_type' END AS event_code,
       CASE WHEN d.subject_route = ANY(%(codes)s::text[]) THEN 'rule:' || d.subject_map_version
            ELSE 'llm:classification' END AS classifier,
       d.classification ->> 'sub_type' AS subtype
  FROM core.disclosures d
 WHERE {EVENT_ROW_SQL}
   AND (d.subject_route = ANY(%(codes)s::text[]) OR d.classification ->> 'event_type' = ANY(%(codes)s::text[]))
   AND d.available_at < %(as_of)s
   AND NOT EXISTS (SELECT 1 FROM core.events e WHERE e.disclosure_index = d.disclosure_index)
"""  # noqa: S608 - module constants only
INSERT_EVENT_SQL: Final = """
INSERT INTO core.events (source_kind, disclosure_index, ticker, event_code, subtype, classifier, event_time,
  available_at, t0_session)
VALUES ('kap', %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (disclosure_index, classifier) DO NOTHING
"""
_PENDING_WHERE: Final = f"""e.source_kind = 'kap' AND e.t0_session IS NOT NULL AND e.t0_session <= %(day)s
   AND e.available_at < %(as_of)s AND e.returns_settled_at IS NULL AND {unsealed_sql("e.event_time", "as_of")}"""
PENDING_SQL: Final = f"""
SELECT e.event_id, e.ticker, e.event_time, e.t0_session,
       coalesce(array_agg(r.horizon) FILTER (WHERE r.horizon IS NOT NULL), '{{}}') AS done
  FROM core.events e LEFT JOIN core.event_returns r USING (event_id)
 WHERE {_PENDING_WHERE} AND (%(ticker)s::text IS NULL OR e.ticker = %(ticker)s::text)
 GROUP BY e.event_id
HAVING count(r.horizon) < %(n)s
 ORDER BY e.event_time DESC
 LIMIT %(limit)s
"""  # noqa: S608 - module constants only
PENDING_TICKERS_SQL: Final = f"SELECT DISTINCT e.ticker FROM core.events e WHERE {_PENDING_WHERE} ORDER BY e.ticker"  # noqa: S608
SETTLE_SQL: Final = "UPDATE core.events SET returns_settled_at = %s WHERE event_id = ANY(%s::bigint[])"
INSERT_RETURN_SQL: Final = """
INSERT INTO core.event_returns (event_id, horizon, model, t0, t_end, raw_ret, bench_ret, car, alpha, beta, n_obs,
  available_at, computed_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (event_id, horizon, model) DO NOTHING
"""

Work = tuple[dict[str, Any], list[int], date]


@dataclass(frozen=True, slots=True)
class EventReturnsStats:
    new_events: int
    pending: int
    rows: int
    no_prices: int


def job_as_of(day: date) -> datetime:
    return datetime.combine(day, JOB_TIME, IST)


def _t0(published_at: datetime) -> date | None:
    try:
        return entry_session(published_at)
    except CalendarRangeError:
        return None


async def sync_events(conn: Conn, as_of: datetime) -> int:
    rows = await fetch_all(conn, NEW_EVENTS_SQL, {"codes": E_CODES, "as_of": as_of})
    params = [
        (
            r["disclosure_index"], r["ticker"], r["event_code"], r["subtype"], r["classifier"], r["published_at"],
            r["available_at"], _t0(r["published_at"]),
        )
        for r in rows
        if r["event_code"] in E_CODES
    ]  # fmt: skip
    return await execute_many(conn, INSERT_EVENT_SQL, params)


def window_sums(stock: Series, bench: Series, t0: date, horizon: int) -> tuple[float, float] | None:
    """Σ stock and Σ XU100 daily returns over [t0, t0 + h − 1] (the entry session open → close)."""
    rs_total = rb_total = 0.0
    for k in range(horizon):
        d = add_sessions(t0, k)
        rs = entry_return(stock, d) if k == 0 else close_return(stock, d)
        rb = entry_return(bench, d) if k == 0 else close_return(bench, d)
        if rs is None or rb is None:
            return None
        rs_total, rb_total = rs_total + rs, rb_total + rb
    return rs_total, rb_total


def returns_of(
    event: dict[str, Any], horizons: Sequence[int], stock: Series, bench: Series, model: MarketModel, now: datetime
) -> list[tuple[Any, ...]]:
    t0: date = event["t0_session"]
    out = []
    for h in horizons:
        cars = event_cars(stock, bench, t0, [h], model)
        sums = window_sums(stock, bench, t0, h)
        if cars is None or sums is None:
            continue
        t_end = add_sessions(t0, h - 1)
        out.append(
            (
                event["event_id"], h, model.kind, t0, t_end, round(sums[0], 8), round(sums[1], 8), round(cars[h], 8),
                model.alpha, round(model.beta, 4), model.n_obs, close_known_at(t_end), now,
            )
        )  # fmt: skip
    return out


def _start(sessions: Sequence[date]) -> date:
    try:
        return add_sessions(min(sessions), ESTIMATION_WINDOW[0] - 1)
    except CalendarRangeError:
        return date(FIRST_YEAR, 1, 1)


def _ready(pending: Sequence[dict[str, Any]], as_of: datetime) -> list[Work]:
    """Every pending event with its horizons that closed and are not stored yet, and its event session."""
    work: list[Work] = []
    for ev in pending:
        try:
            ready = [h for h in HORIZONS if h not in ev["done"] and window_closed(ev["t0_session"], h, as_of)]
            session = event_session(ev["event_time"])
        except CalendarRangeError:
            continue
        if ready:
            work.append((ev, ready, session))
    return work


def _settled(work: Sequence[Work], as_of: datetime) -> list[int]:
    """Events whose longest window closed: tried now, not retried until an archive run clears the mark."""
    return [ev["event_id"] for ev, _, _ in work if window_closed(ev["t0_session"], HORIZONS[-1], as_of)]


async def _materialise(
    conn: Conn, work: Sequence[Work], as_of: datetime, written_at: datetime, bench: Series | None = None
) -> tuple[int, int]:
    """(rows stored, events without any computable horizon), in one transaction."""
    if not work:
        return 0, 0
    last = last_known_session(as_of)
    start = _start([s for _, _, s in work])
    tickers = sorted({ev["ticker"] for ev, _, _ in work})
    market = await repo.benchmark(conn, start, last) if bench is None else bench
    excluded = await repo.excluded_days(conn, tickers, as_of, last)
    by_ticker: dict[str, Series] = {t: await repo.series(conn, t, start, last) for t in tickers}
    rows: list[tuple[Any, ...]] = []
    no_prices = 0
    for ev, ready, session in work:
        stock = by_ticker[ev["ticker"]]
        model = fit_market_model(stock, market, estimation_days(session, excluded.get(ev["ticker"], ())))
        got = returns_of(ev, ready, stock, market, model, written_at)
        no_prices += not got
        rows.extend(got)
    async with conn.transaction():
        n = await execute_many(conn, INSERT_RETURN_SQL, rows)
        await execute(conn, SETTLE_SQL, (written_at, _settled(work, as_of)))
    return n, no_prices


async def run_event_returns(conn: Conn, day: date, *, now: datetime | None = None) -> EventReturnsStats:
    """Sync core.events, then materialise every matured horizon not stored yet (as of `day` 20:00)."""
    as_of = job_as_of(day)
    written_at = now or as_of
    new_events = await sync_events(conn, as_of)
    params = {"day": day, "as_of": as_of, "n": len(HORIZONS), "limit": MAX_EVENTS_PER_RUN, "ticker": None}
    work = _ready(await fetch_all(conn, PENDING_SQL, params), as_of)
    n, no_prices = await _materialise(conn, work, as_of, written_at)
    log.info("event_returns %s: %d new events, %d pending, %d rows", day, new_events, len(work), n)
    return EventReturnsStats(new_events, len(work), n, no_prices)


async def run_archive_returns(
    conn: Conn, day: date, *, now: datetime, on_ticker: Callable[[int, int, str], None] | None = None
) -> EventReturnsStats:
    """The whole backlog, one company at a time and committed per company: a stop keeps what was stored."""
    as_of = job_as_of(day)
    new_events = await sync_events(conn, as_of)
    await conn.commit()
    base = {"day": day, "as_of": as_of, "n": len(HORIZONS), "limit": ARCHIVE_EVENTS_PER_TICKER}
    tickers = [str(r["ticker"]) for r in await fetch_all(conn, PENDING_TICKERS_SQL, base)]
    bench = await repo.benchmark(conn, date(FIRST_YEAR, 1, 1), last_known_session(as_of))
    await conn.commit()
    pending = rows = no_prices = 0
    for i, ticker in enumerate(tickers, 1):
        work = _ready(await fetch_all(conn, PENDING_SQL, {**base, "ticker": ticker}), as_of)
        n, missing = await _materialise(conn, work, as_of, now, bench)
        await conn.commit()
        pending, rows, no_prices = pending + len(work), rows + n, no_prices + missing
        if on_ticker is not None:
            on_ticker(i, len(tickers), ticker)
    return EventReturnsStats(new_events, pending, rows, no_prices)
