"""SQL of the evidence tools (parametrised; reads only). Point in time: every query is bounded by
`as_of` (disclosures: `available_at < as_of`) or by the last session known before it (prices)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.rows import dict_row

from kaptan.evidence.params import BENCHMARK, EXCLUDED_ACTION_KINDS, MAX_EVENTS
from kaptan.evidence.sessions import event_session
from kaptan.evidence.study import Bar, MarketModel, ModelKind, PastEvent, Precomputed, Series
from kaptan.prices.calendar import CalendarRangeError
from kaptan.prices.reads import adjusted_series

Conn = AsyncConnection[Any]
EVENT_TYPES: Final = ("E1", "E2", "E3", "E4")

#: Past real KAP events of one type (subject-mapped or LLM-classified), newest first.
PAST_EVENTS_SQL: Final = """
SELECT d.disclosure_index, d.primary_ticker AS ticker, d.company_name, d.subject, d.summary,
       d.published_at, d.available_at
  FROM core.disclosures d
  LEFT JOIN core.issuers i ON i.ticker = d.primary_ticker
 WHERE d.origin = 'kap' AND d.primary_ticker IS NOT NULL AND NOT d.is_noise AND d.reason = 'NEW'
   AND (d.subject_route = %(event_type)s OR d.classification ->> 'event_type' = %(event_type)s)
   AND d.available_at < %(as_of)s AND d.disclosure_index <> %(self_index)s
   AND (%(ticker)s::text IS NULL OR d.primary_ticker = %(ticker)s::text)
   AND (%(sector)s::text IS NULL OR i.sector = %(sector)s::text)
 ORDER BY d.published_at DESC, d.disclosure_index DESC
 LIMIT %(limit)s
"""
#: Event sessions of every E1–E4 disclosure of these companies (removed from estimation windows).
OTHER_EVENTS_SQL: Final = """
SELECT primary_ticker AS ticker, published_at FROM core.disclosures
 WHERE origin = 'kap' AND primary_ticker = ANY(%s::text[]) AND available_at < %s
   AND (subject_route = ANY(%s::text[]) OR classification ->> 'event_type' = ANY(%s::text[]))
"""
#: Corporate actions are stored under the price source's code; `core.ticker_codes` maps a renamed
#: company's old code to it (core.ticker_history, e.g. KOZAL → TRALT).
ACTION_DATES_SQL: Final = """
SELECT t.ticker, ca.ex_date FROM unnest(%s::text[]) AS t(ticker)
  JOIN core.corporate_actions ca ON ca.ticker = ANY(core.ticker_codes(t.ticker))
 WHERE ca.kind = ANY(%s::text[]) AND ca.ex_date <= %s
"""
ACTIONS_SQL: Final = """
SELECT DISTINCT ON (ex_date, kind) ex_date, kind, factor, announced_at FROM core.corporate_actions
 WHERE ticker = ANY(core.ticker_codes(%(t)s)) AND ex_date >= %(since)s ORDER BY ex_date, kind, ticker <> %(t)s
"""
LAST_RAW_SQL: Final = """
SELECT d, close, mcap_try, free_float_mcap_try, capital_try FROM core.prices_daily
 WHERE ticker = ANY(core.ticker_codes(%(t)s)) AND source = 'isyatirim' AND price_basis = 'raw' AND d <= %(d)s
 ORDER BY d DESC, ticker <> %(t)s LIMIT 1
"""
SECTOR_SQL: Final = "SELECT sector FROM core.issuers WHERE ticker = %s"


async def rows(conn: Conn, sql: str, params: Sequence[Any] | dict[str, Any]) -> list[dict[str, Any]]:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql, params)
        return await cur.fetchall()


async def series(conn: Conn, ticker: str, start: date, end: date) -> Series:
    """Adjusted (open, close) bars over [start, end] as floats (one source per series, P8)."""
    _src, bars = await adjusted_series(conn, ticker, start, end)
    return {d: Bar(None if o is None else float(o), float(c)) for d, (o, c) in bars.items()}


async def benchmark(conn: Conn, start: date, end: date) -> Series:
    return await series(conn, BENCHMARK, start, end)


async def past_events(
    conn: Conn,
    event_type: str,
    as_of: datetime,
    self_index: int,
    *,
    ticker: str | None = None,
    sector: str | None = None,
    limit: int = MAX_EVENTS,
) -> list[PastEvent]:
    params = {
        "event_type": event_type,
        "as_of": as_of,
        "self_index": self_index,
        "ticker": ticker,
        "sector": sector,
        "limit": limit,
    }
    return [
        PastEvent(
            ref_id=f"evt:kap:{r['disclosure_index']}",
            ticker=r["ticker"],
            company_name=r["company_name"],
            title=f"{r['company_name']} – {r['subject']}",
            published_at=r["published_at"],
            available_at=r["available_at"],
        )
        for r in await rows(conn, PAST_EVENTS_SQL, params)
    ]


async def excluded_days(conn: Conn, tickers: Sequence[str], as_of: datetime, until: date) -> dict[str, set[date]]:
    """Per company: event sessions of its E1–E4 disclosures and ex-dates of bonus/rights issues/splits."""
    names = sorted(set(tickers))
    out: dict[str, set[date]] = {t: set() for t in names}
    types = list(EVENT_TYPES)
    for r in await rows(conn, OTHER_EVENTS_SQL, (names, as_of, types, types)):
        try:
            out[r["ticker"]].add(event_session(r["published_at"]))
        except CalendarRangeError:
            continue
    for r in await rows(conn, ACTION_DATES_SQL, (names, sorted(EXCLUDED_ACTION_KINDS), until)):
        out[r["ticker"]].add(r["ex_date"])
    return out


async def actions(conn: Conn, ticker: str, since: date) -> list[dict[str, Any]]:
    return await rows(conn, ACTIONS_SQL, {"t": ticker, "since": since})


async def last_raw(conn: Conn, ticker: str, session: date) -> dict[str, Any] | None:
    found = await rows(conn, LAST_RAW_SQL, {"t": ticker, "d": session})
    return found[0] if found else None


async def sector_of(conn: Conn, ticker: str) -> str | None:
    found = await rows(conn, SECTOR_SQL, (ticker,))
    return None if not found else found[0]["sector"] or None


#: Materialised CARs (core.event_returns, `run_event_returns`), point in time: `available_at < as_of`.
EVENT_RETURNS_SQL: Final = """
SELECT e.event_id, e.disclosure_index, r.horizon, r.model, r.t0, r.car, r.alpha, r.beta, r.n_obs
  FROM core.events e JOIN core.event_returns r USING (event_id)
 WHERE e.source_kind = 'kap' AND e.disclosure_index = ANY(%s::bigint[]) AND r.horizon = ANY(%s::int[])
   AND r.available_at < %s
 ORDER BY e.disclosure_index, e.event_id, r.horizon
"""
REF_PREFIX: Final = "evt:kap:"


async def materialised_cars(
    conn: Conn, events: Sequence[PastEvent], horizons: Sequence[int], as_of: datetime
) -> dict[str, Precomputed]:
    """ref_id → the stored CARs of every event whose requested horizons were all known before `as_of`.

    Events not in the table (or with a horizon still missing) are absent: the study computes them."""
    indices = [int(e.ref_id.removeprefix(REF_PREFIX)) for e in events if e.ref_id.startswith(REF_PREFIX)]
    if not indices:
        return {}
    wanted = sorted(set(horizons))
    first_event: dict[int, int] = {}
    rows_of: dict[int, list[dict[str, Any]]] = {}
    for r in await rows(conn, EVENT_RETURNS_SQL, (indices, wanted, as_of)):
        idx = int(r["disclosure_index"])
        if first_event.setdefault(idx, int(r["event_id"])) == int(r["event_id"]):
            rows_of.setdefault(idx, []).append(r)
    out: dict[str, Precomputed] = {}
    for idx, rs in rows_of.items():
        cars = {int(r["horizon"]): float(r["car"]) for r in rs}
        if sorted(cars) != wanted or len({r["t0"] for r in rs}) != 1:
            continue
        r0 = rs[-1]
        kind: ModelKind = "market_model" if r0["model"] == "market_model" else "market_adj"
        model = MarketModel(
            float(r0["alpha"] or 0.0), float(r0["beta"] if r0["beta"] is not None else 1.0), int(r0["n_obs"] or 0), kind
        )
        out[f"{REF_PREFIX}{idx}"] = Precomputed(rs[0]["t0"], cars, model)
    return out
