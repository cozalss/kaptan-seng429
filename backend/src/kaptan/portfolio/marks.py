"""JavaScript-compatible rounding (the panel's `round`, so both sides agree to the lira) and session arithmetic."""

from __future__ import annotations

import math
from datetime import date, datetime
from typing import Final

from kaptan.rules.calendar import is_trading_day as is_trading_day  # re-exported (#32)
from kaptan.rules.calendar import next_trading_day as next_trading_day

DAY_MS: Final = 86_400_000
#: A ticket marked "entered" is held for five sessions (selectors.ts personalPositions()).
PERSONAL_HOLD_SESSIONS: Final = 5


def js_round(value: float) -> int:
    """`Math.round()`: halves round towards +infinity (Python's round() is banker's rounding)."""
    return math.floor(value + 0.5)


def round_to(value: float, decimals: int = 2) -> float:
    """rng.ts `round(value, decimals)` = Math.round(value * 10^d) / 10^d."""
    f = int(10**decimals)
    return js_round(value * f) / f


def add_sessions(d: date, sessions: int) -> date:
    """`sessions` times nextTradingDay() (the planned exit date of a position)."""
    out = d
    for _ in range(max(0, sessions)):
        out = next_trading_day(out)
    return out


def holding_days(opened_at: datetime, now: datetime) -> int:
    """max(0, Math.round((now − opened) / 1 day))."""
    ms = (now - opened_at).total_seconds() * 1000
    return max(0, js_round(ms / DAY_MS))
