"""The market strip (GET /market/strip): BIST 100 level and day change, open or closed, USD/TRY.

BIST 100 is the stored XU100 daily close (Yahoo, loaded by the 18:30 price job and the warm-up), so the day is
the last stored session, not a live quote. USD/TRY is the TCMB bulletin stored in `core.fx_rates`. Open/closed
comes from the BIST calendar (`kaptan.prices.calendar`). A value that is not stored is null: never a guess.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.domain.schemas._base import iso_ms
from kaptan.prices import calendar as bist
from kaptan.reference._sql import fetch_all

INDEX: Final = "XU100"
INDEX_SQL: Final = """
SELECT DISTINCT ON (d) d, close FROM core.prices_daily WHERE ticker = %s AND close > 0
 ORDER BY d DESC, (source = 'yfinance') DESC LIMIT 2
"""
FX_SQL: Final = """
SELECT d, rate, available_at FROM core.fx_rates WHERE currency = 'USD' AND available_at <= %s
 ORDER BY available_at DESC LIMIT 1
"""
MAX_FX_AGE: Final = timedelta(days=10)


def market_state(now: datetime) -> dict[str, Any]:
    """Open while the session runs (10:00 to the close of that day); otherwise the next session's day."""
    local = now.astimezone(bist.IST)
    today = local.date()
    try:
        if bist.is_trading_day(today):
            opens = datetime.combine(today, bist.SESSION_OPEN, bist.IST)
            if opens <= local < bist.session_close(today):
                return {"open": True, "label": "Borsa açık", "next_open_day": None}
            if local < opens:
                return {"open": False, "label": "Borsa kapalı", "next_open_day": today}
        return {"open": False, "label": "Borsa kapalı", "next_open_day": bist.next_session(today)}
    except bist.CalendarRangeError:
        return {"open": False, "label": "Borsa kapalı", "next_open_day": None}


async def strip(conn: AsyncConnection[Any], now: datetime) -> dict[str, Any]:
    bars = await fetch_all(conn, INDEX_SQL, (INDEX,))
    index = None
    if bars:
        last = float(bars[0]["close"])
        prev = float(bars[1]["close"]) if len(bars) > 1 else None
        index = {"level": last, "day": bars[0]["d"],
                 "change_pct": None if not prev else round((last / prev - 1) * 100, 2)}  # fmt: skip
    fx_rows = await fetch_all(conn, FX_SQL, (now,))
    fx = None
    if fx_rows and now - fx_rows[0]["available_at"] <= MAX_FX_AGE:
        r = fx_rows[0]
        fx = {"rate": float(r["rate"]), "day": r["d"], "published_at": iso_ms(r["available_at"])}
    return {"as_of": iso_ms(now), "market": market_state(now), "index": index, "usd_try": fx}
