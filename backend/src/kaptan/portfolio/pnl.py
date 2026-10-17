"""The forward paper P&L series (trading.pnl_daily, fixture order) and its last point."""

from __future__ import annotations

from datetime import date
from typing import Any, Final

from psycopg import AsyncConnection

#: The strategy the desk trades live today (mocks/pnl.ts LIVE_STRATEGY).
LIVE_STRATEGY: Final = "kaptan:v1.1-fwd"

PNL_SQL: Final = """
SELECT d, strategy, equity, daily_return, peak_equity, drawdown, n_positions, n_trades
FROM trading.pnl_daily
WHERE (%(from)s::date IS NULL OR d >= %(from)s::date) AND (%(to)s::date IS NULL OR d <= %(to)s::date)
ORDER BY ord
"""

LAST_POINT_SQL: Final = """
SELECT equity, peak_equity FROM trading.pnl_daily WHERE strategy = %s ORDER BY ord DESC LIMIT 1
"""


def _num(value: Any) -> float | int:
    """Whole numbers stay ints (equity 1016480, not 1016480.0), like the mock's JSON."""
    x = float(value)
    return int(x) if x.is_integer() else x


async def list_pnl(conn: AsyncConnection[Any], from_: date | None, to: date | None) -> list[dict[str, Any]]:
    """PnlPoint[] with inclusive bounds (mock: `p.d >= from && p.d <= to`)."""
    async with conn.cursor() as cur:
        await cur.execute(PNL_SQL, {"from": from_, "to": to})
        rows = await cur.fetchall()
    return [
        {
            "d": r["d"],
            "strategy": r["strategy"],
            "equity": _num(r["equity"]),
            "daily_return": float(r["daily_return"]),
            "peak_equity": _num(r["peak_equity"]),
            "drawdown": float(r["drawdown"]),
            "n_positions": int(r["n_positions"]),
            "n_trades": int(r["n_trades"]),
        }
        for r in rows
    ]


async def last_live_point(conn: AsyncConnection[Any]) -> tuple[float, float] | None:
    """(equity, peak_equity) of the live strategy's last close, or None without a series."""
    async with conn.cursor() as cur:
        await cur.execute(LAST_POINT_SQL, (LIVE_STRATEGY,))
        row = await cur.fetchone()
    return None if row is None else (float(row["equity"]), float(row["peak_equity"]))
