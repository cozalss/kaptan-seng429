"""What the stored prices and disclosures say about one company, for its page and the compare page.

Nothing here leaves the PC and nothing is guessed: no stored bar means no number.
- Price statistics: the last day's range and volume (raw level) and the year range, read from the bonus-corrected
  view so a capital increase does not fake a fall.
- BIST 100: the stored XU100 closes (Yahoo; the evening price job and the warm-up load them).
- Insider and buyback events: KAP disclosures that were classed E1 (company buys back its own shares) or
  E2 (executive or main owner bought shares). The class is KAPtan's reading; the disclosure itself is linked.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Final

from kaptan.db import DictConn
from kaptan.disclosures.listing import LIST_ITEM_COLUMNS, to_item
from kaptan.reference._sql import fetch_all

INDEX_TICKER: Final = "XU100"
INDEX_NAME: Final = "BIST 100"
YEAR_DAYS: Final = 366
INSIDER_LIMIT: Final = 20
EVENT_WINDOW_DAYS: Final = 90
KIND_OF_TYPE: Final = {"E1": "buyback", "E2": "insider"}

YEAR_SQL: Final = """
SELECT DISTINCT ON (d) d, adj_high, adj_low, adj_close, adj_factor, raw_close,
       p.high, p.low, p.volume
  FROM core.prices_daily_adj a
  JOIN core.prices_daily p USING (ticker, d, source)
 WHERE ticker = ANY(core.ticker_codes(%(t)s)) AND source = 'isyatirim' AND p.price_basis = 'raw' AND d >= %(since)s
 ORDER BY d, ticker <> %(t)s
"""
INDEX_SQL: Final = """
SELECT d, close FROM core.prices_daily
 WHERE ticker = %(t)s AND source = 'yfinance' AND (%(since)s::date IS NULL OR d >= %(since)s) ORDER BY d
"""
INSIDER_SQL: Final = f"""
SELECT {LIST_ITEM_COLUMNS} FROM core.disclosures
 WHERE (primary_ticker = %(t)s OR %(t)s = ANY(stock_codes)) AND classification->>'event_type' IN ('E1', 'E2')
 ORDER BY published_at DESC, disclosure_index DESC LIMIT %(limit)s
"""  # noqa: S608
COUNTS_SQL: Final = """
SELECT classification->>'event_type' AS etype, count(*) AS n FROM core.disclosures
 WHERE (primary_ticker = %(t)s OR %(t)s = ANY(stock_codes)) AND published_at >= %(since)s AND NOT is_noise
 GROUP BY 1
"""


def _f(value: Any) -> float | None:
    return None if value is None else float(value)


def price_stats(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The statistics of `rows` (one per stored day, oldest first), or None without a bar. Pure.

    A day's high/low fall back to its close when the source gave none, so the range never claims more than stored.
    """
    if not rows:
        return None
    last = rows[-1]
    highs = [(_f(r["adj_high"] if r["adj_high"] is not None else r["adj_close"]), r["d"]) for r in rows]
    lows = [(_f(r["adj_low"] if r["adj_low"] is not None else r["adj_close"]), r["d"]) for r in rows]
    top = max(highs, key=lambda x: x[0] or 0.0)
    bottom = min(lows, key=lambda x: x[0] if x[0] is not None else float("inf"))
    close = float(last["raw_close"])
    return {
        "as_of": last["d"],
        "day_low": _f(last["low"]),
        "day_high": _f(last["high"]),
        "volume": _f(last["volume"]),
        "year_low": bottom[0],
        "year_high": top[0],
        "year_low_day": bottom[1],
        "year_high_day": top[1],
        "year_days": len(rows),
        "from_high_pct": round((close / top[0] - 1) * 100, 2) if top[0] else None,
        "adjusted": any(abs(float(r["adj_factor"]) - 1) > 1e-9 for r in rows),
    }


async def company_stats(conn: DictConn, ticker: str, today: date) -> dict[str, Any] | None:
    rows = await fetch_all(conn, YEAR_SQL, {"t": ticker, "since": today - timedelta(days=YEAR_DAYS)})
    return price_stats(rows)


async def index_line(conn: DictConn, since: date | None) -> dict[str, Any] | None:
    """BIST 100 closes from `since` (None: all stored), or None when fewer than two are stored."""
    rows = await fetch_all(conn, INDEX_SQL, {"t": INDEX_TICKER, "since": since})
    if len(rows) < 2:
        return None
    return {"name": INDEX_NAME, "points": [{"d": r["d"], "close": float(r["close"])} for r in rows]}


async def insider_events(conn: DictConn, ticker: str) -> list[dict[str, Any]]:
    rows = await fetch_all(conn, INSIDER_SQL, {"t": ticker, "limit": INSIDER_LIMIT})
    return [{"kind": KIND_OF_TYPE[r["classification"]["event_type"]], "disclosure": to_item(dict(r))} for r in rows]


def event_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    """The 90-day counts by KAPtan's class from `COUNTS_SQL` rows. Pure."""
    by = {r["etype"]: int(r["n"]) for r in rows}
    return {
        "total": sum(by.values()),
        "buyback": by.get("E1", 0),
        "insider": by.get("E2", 0),
        "deal": by.get("E3", 0),
        "earnings": by.get("E4", 0),
    }


async def company_events(conn: DictConn, ticker: str, now: datetime) -> dict[str, int]:
    rows = await fetch_all(conn, COUNTS_SQL, {"t": ticker, "since": now - timedelta(days=EVENT_WINDOW_DAYS)})
    return event_counts(rows)
