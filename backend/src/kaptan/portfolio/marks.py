"""JavaScript-compatible rounding, the BIST session calendar and the M1 replay quotes.

All three reproduce the panel mock exactly (kaptan-panel/src/mocks/rng.ts `round`, lib/time.ts,
api/mock/selectors.ts `positions()`), because positions and risk numbers must match it to the lira.

Replay quotes: M1 has no market-data feed, so a position's last price is the mock's deterministic
mark (the issuer's reference price moved by the disclosure index; the demo E3 run is pinned to
48.51). M2 replaces `mark_price()` with live quotes.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta
from typing import Final

#: Exchange holidays the panel calendar knows (lib/time.ts HOLIDAYS).
HOLIDAYS: Final = frozenset({date(2026, 10, 29), date(2027, 1, 1)})
DAY_MS: Final = 86_400_000
#: The demo E3 run's mark (selectors.ts positions()).
DEMO_E3_RUN: Final = "run-demo-e3-ornek"
DEMO_E3_MARK: Final = 48.51
#: A ticket marked "entered" is held for five sessions (selectors.ts personalPositions()).
PERSONAL_HOLD_SESSIONS: Final = 5


def js_round(value: float) -> int:
    """`Math.round()`: halves round towards +infinity (Python's round() is banker's rounding)."""
    return math.floor(value + 0.5)


def round_to(value: float, decimals: int = 2) -> float:
    """rng.ts `round(value, decimals)` = Math.round(value * 10^d) / 10^d."""
    f = int(10**decimals)
    return js_round(value * f) / f


def is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and d not in HOLIDAYS


def next_trading_day(d: date) -> date:
    nxt = d + timedelta(days=1)
    while not is_trading_day(nxt):
        nxt += timedelta(days=1)
    return nxt


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


def mark_price(*, book: str, run_id: str, issuer_price: float, disclosure_index: int) -> float:
    """The unrounded last price of a position (replay quotes, see the module docstring)."""
    if book == "personal":
        return issuer_price
    if run_id == DEMO_E3_RUN:
        return DEMO_E3_MARK
    return issuer_price * (1 + ((disclosure_index % 7) - 2) / 100)
