"""Two companies side by side (`GET /compare`): the price line over one period, the quiet statistics and how many
KAP disclosures of each kind the last 90 days brought. Only what is stored; no multiples, no forecasts."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from kaptan.api.errors import ApiError
from kaptan.companies.market import company_events, company_stats
from kaptan.companies.profile import IDENTITY_SQL, MAX_POINTS, PERIOD_DAYS, PRICES_SQL, Period, company_name
from kaptan.db import DictConn
from kaptan.reference._sql import fetch_all, fetch_one


async def _side(conn: DictConn, ticker: str, now: datetime, period: Period) -> dict[str, Any]:
    identity = await fetch_one(conn, IDENTITY_SQL, {"t": ticker})
    name = await company_name(conn, ticker, identity)
    if name is None:
        raise ApiError(404, "not_found", f"{ticker} diye bir şirket bulamadım.")
    today = now.date()
    days = PERIOD_DAYS[period]
    since = None if days is None else today - timedelta(days=days)
    bars = (await fetch_all(conn, PRICES_SQL, {"t": ticker, "since": since}))[-MAX_POINTS:]
    last = bars[-1]["close"] if bars else None
    prev = bars[-2]["close"] if len(bars) > 1 else None
    return {
        "ticker": ticker,
        "name": name,
        "sector": (identity or {}).get("sector") or None,
        "price": {
            "period": period,
            "points": [{"d": b["d"], "close": float(b["close"])} for b in bars],
            "last_close": None if last is None else float(last),
            "last_day": bars[-1]["d"] if bars else None,
            "change_pct": None if last is None or not prev else round((float(last) / float(prev) - 1) * 100, 2),
        },
        "stats": await company_stats(conn, ticker, today),
        "events": await company_events(conn, ticker, now),
    }


async def compare(conn: DictConn, a: str, b: str, *, now: datetime, period: Period) -> dict[str, Any]:
    return {
        "period": period,
        "a": await _side(conn, a, now, period),
        "b": await _side(conn, b, now, period),
    }
