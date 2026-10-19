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
from kaptan.evidence.study import Bar, PastEvent, Series
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
ACTION_DATES_SQL: Final = """
SELECT ticker, ex_date FROM core.corporate_actions
 WHERE ticker = ANY(%s::text[]) AND kind = ANY(%s::text[]) AND ex_date <= %s
"""
ACTIONS_SQL: Final = """
SELECT ex_date, kind, factor, announced_at FROM core.corporate_actions
 WHERE ticker = %s AND ex_date >= %s ORDER BY ex_date, kind
"""
LAST_RAW_SQL: Final = """
SELECT d, close, mcap_try, free_float_mcap_try, capital_try FROM core.prices_daily
 WHERE ticker = %s AND source = 'isyatirim' AND price_basis = 'raw' AND d <= %s
 ORDER BY d DESC LIMIT 1
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
    return await rows(conn, ACTIONS_SQL, (ticker, since))


async def last_raw(conn: Conn, ticker: str, session: date) -> dict[str, Any] | None:
    found = await rows(conn, LAST_RAW_SQL, (ticker, session))
    return found[0] if found else None


async def sector_of(conn: Conn, ticker: str) -> str | None:
    found = await rows(conn, SECTOR_SQL, (ticker,))
    return None if not found else found[0]["sector"] or None
