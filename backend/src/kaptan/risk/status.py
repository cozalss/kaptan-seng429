"""RiskStatus (GET /risk/status, SSE desk `kill_switch` / `halt`): the book marked to market now, the switch, quotas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.portfolio.marks import js_round
from kaptan.risk.book import effective_drawdown, paper_book
from kaptan.risk.kill_switch import reset_view
from kaptan.settings import get_settings

STATE_SQL: Final = """
SELECT rs.kill_switch, rs.kill_reason, rs.kill_at, rs.kill_by, rs.halted_today, rs.daily_pnl_pct,
       rs.drawdown_pct, rs.regime, rs.reset_started, rs.reset_at, rs.reset_equity,
       COALESCE((SELECT armed FROM trading.live_arm WHERE id = 1), false) AS live_armed
FROM trading.risk_state rs WHERE rs.id = 1
"""

QUOTA_SQL: Final = "SELECT provider, used, limit_n FROM trading.quota_usage ORDER BY ord"


class RiskStateMissingError(RuntimeError):
    """trading.risk_state has no row (the database was not seeded)."""


def _whole(x: float) -> float | int:
    return int(x) if float(x).is_integer() else x


async def risk_status(conn: AsyncConnection[Any], now: datetime, *, capital: float | None = None) -> dict[str, Any]:
    """Equity, peak, drawdown and daily P&L from the book marked to market now (kaptan.risk.book)."""
    async with conn.cursor() as cur:
        await cur.execute(STATE_SQL)
        r = await cur.fetchone()
        if r is None:
            raise RiskStateMissingError("trading.risk_state is empty")
        await cur.execute(QUOTA_SQL)
        quota_rows = await cur.fetchall()
    book = await paper_book(conn, now, capital=capital or get_settings().paper_capital_try)
    equity, peak = js_round(float(book.equity)), float(js_round(float(book.peak_equity)))
    reset_eq = None if r["reset_equity"] is None else Decimal(str(r["reset_equity"]))
    dd = effective_drawdown(book, reset_eq, reset_active=r["reset_at"] is not None)
    daily, drawdown = round(float(book.daily_pnl_pct), 5), round(float(dd), 5)
    on = r["kill_switch"] == "on"
    return {
        "kill_switch": r["kill_switch"],
        "kill_reason": r["kill_reason"],
        "kill_at": r["kill_at"],
        "kill_by": r["kill_by"],
        "halted_today": bool(r["halted_today"]),
        "daily_pnl_pct": daily,
        "drawdown_pct": drawdown,
        "peak_equity": _whole(peak),
        "equity": equity,
        "regime": r["regime"],
        "live_armed": bool(r["live_armed"]),
        "quota": [{"provider": q["provider"], "used": int(q["used"]), "limit": int(q["limit_n"])} for q in quota_rows],
        "reset": reset_view(r["reset_started"], r["kill_at"], now) if on else None,
        "as_of": now,
    }
