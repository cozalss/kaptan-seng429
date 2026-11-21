"""RiskStatus (GET /risk/status): the book marked to market now, the regime, quotas. Information only."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.portfolio.marks import js_round
from kaptan.risk.book import own_book

STATE_SQL: Final = """
SELECT rs.regime,
       COALESCE((SELECT armed FROM trading.live_arm WHERE id = 1), false) AS live_armed
FROM trading.risk_state rs WHERE rs.id = 1
"""

QUOTA_SQL: Final = "SELECT provider, used, limit_n FROM trading.quota_usage ORDER BY ord"


class RiskStateMissingError(RuntimeError):
    """trading.risk_state has no row (the database was not seeded)."""


def _whole(x: float) -> float | int:
    return int(x) if float(x).is_integer() else x


async def risk_status(conn: AsyncConnection[Any], now: datetime) -> dict[str, Any]:
    """Equity, peak, drawdown and daily P&L from the person's book marked to market now (kaptan.risk.book).
    Before the starting money exists they are all 0."""
    async with conn.cursor() as cur:
        await cur.execute(STATE_SQL)
        r = await cur.fetchone()
        if r is None:
            raise RiskStateMissingError("trading.risk_state is empty")
        await cur.execute(QUOTA_SQL)
        quota_rows = await cur.fetchall()
    book = await own_book(conn, now)
    equity, peak = js_round(float(book.equity)), float(js_round(float(book.peak_equity)))
    daily, drawdown = round(float(book.daily_pnl_pct), 5), round(float(book.drawdown_pct), 5)
    return {
        "daily_pnl_pct": daily,
        "drawdown_pct": drawdown,
        "peak_equity": _whole(peak),
        "equity": equity,
        "regime": r["regime"],
        "live_armed": bool(r["live_armed"]),
        "quota": [{"provider": q["provider"], "used": int(q["used"]), "limit": int(q["limit_n"])} for q in quota_rows],
        "as_of": now,
    }
