"""P8 (06 §7.2): no new entry in a symbol for 10 sessions after a stop (X2) exit — one check for both brakes.

The agent's pre-trade gate (R08, via the desk builders in kaptan.agents) and GuardedBroker at send read
the same `trading.symbol_cooldowns` row through `cooldown_active()`, so the gate never proposes a ticket
the broker would refuse.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from psycopg import AsyncConnection

from kaptan.portfolio.closing import in_cooldown
from kaptan.prices.calendar import istanbul_date
from kaptan.risk.gate import COOLDOWN_TR

__all__ = ["COOLDOWN_TR", "cooldown_active"]


async def cooldown_active(conn: AsyncConnection[Any], ticker: str, now: datetime) -> bool:
    """Is `ticker` inside a P8 stop cooldown on `now`'s Istanbul day?"""
    return await in_cooldown(conn, ticker, istanbul_date(now))
