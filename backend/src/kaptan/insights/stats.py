"""Return and risk statistics of the person's own money line, free of deposits and withdrawals.

Every number comes from the daily closes in `trading.pnl_daily` (`daily_return` is already flow-free, see
`kaptan.risk.book`): the time-weighted return is the chain of those returns, the biggest fall is measured on that
chain from its highest point to the lowest one after it. Closes only: today's unfinished day is not in it. Fewer than
two closes say nothing; fewer than 20 come with a plain warning.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.portfolio.pnl import LIVE_STRATEGY

ROWS_SQL: Final = "SELECT d, daily_return FROM trading.pnl_daily WHERE strategy = %s ORDER BY d"
MIN_DAYS: Final = 2
ENOUGH_DAYS: Final = 20
NEED_TWO: Final = "En az iki borsa günü kapanışı gerekiyor; ondan sonra yazarım."


async def daily_returns(conn: AsyncConnection[Any]) -> list[tuple[date, float]]:
    async with conn.cursor() as cur:
        await cur.execute(ROWS_SQL, (LIVE_STRATEGY,))
        return [(r["d"], float(r["daily_return"])) for r in await cur.fetchall()]


def compute(rows: list[tuple[date, float]]) -> dict[str, Any]:
    if len(rows) < MIN_DAYS:
        return {
            "available": False, "reason_tr": NEED_TWO, "days": len(rows), "from": None, "to": None, "twr_pct": None,
            "best_day": None, "worst_day": None, "max_fall_pct": None, "fall_from": None, "fall_to": None,
            "caveat_tr": None,
        }  # fmt: skip
    level, peak, peak_d = 1.0, 1.0, rows[0][0]
    worst_fall, fall_from, fall_to = 0.0, None, None
    for d, r in rows:
        level *= 1 + r
        if level > peak:
            peak, peak_d = level, d
        fall = level / peak - 1
        if fall < worst_fall:
            worst_fall, fall_from, fall_to = fall, peak_d, d
    best = max(rows, key=lambda x: x[1])
    worst = min(rows, key=lambda x: x[1])
    caveat = None
    if len(rows) < ENOUGH_DAYS:
        caveat = f"Henüz {len(rows)} borsa günü var; bu rakamlar az güne bakıyor, çok bir şey söylemez."
    return {
        "available": True, "reason_tr": None, "days": len(rows), "from": rows[0][0], "to": rows[-1][0],
        "twr_pct": round((level - 1) * 100, 2),
        "best_day": {"d": best[0], "pct": round(best[1] * 100, 2)},
        "worst_day": {"d": worst[0], "pct": round(worst[1] * 100, 2)},
        "max_fall_pct": round(worst_fall * 100, 2), "fall_from": fall_from, "fall_to": fall_to, "caveat_tr": caveat,
    }  # fmt: skip


async def return_stats(conn: AsyncConnection[Any]) -> dict[str, Any]:
    return compute(await daily_returns(conn))
