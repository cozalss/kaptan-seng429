"""BIST equity price steps (fiyat adımı) and daily price limits (06 R09, U6; 07 §6 "Tavan/taban"). Pure, Decimal.

Tick table of the BIST Pay Piyasası (price range in TL → step). 06 §2 U6 marks the table [U] ("BIST
prosedüründen alınacak"); these are the steps in force on Borsa İstanbul's equity market since 2019:

    0.01 – 19.99 → 0.01      100.00 – 249.90 → 0.10     1 000.00 – 2 499.00 → 1.00
    20.00 – 49.98 → 0.02     250.00 – 499.75 → 0.25     2 500.00 +          → 2.50
    50.00 – 99.95 → 0.05     500.00 – 999.50 → 0.50

Daily limits: base price ±10 % (`session.daily_limit_pct`, 06 §13), put on the tick grid *inwards*
(ceiling rounded down, floor rounded up), so a limit never lies outside ±10 % of the base.
Replay keeps the M1 rule `last × 1.1` (merge), so the demo values do not change.
"""

from __future__ import annotations

from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal
from typing import Final

#: (lower bound of the range, step) in ascending order (06 U6 [U]).
TICK_TABLE: Final[tuple[tuple[Decimal, Decimal], ...]] = (
    (Decimal("0"), Decimal("0.01")),
    (Decimal("20"), Decimal("0.02")),
    (Decimal("50"), Decimal("0.05")),
    (Decimal("100"), Decimal("0.10")),
    (Decimal("250"), Decimal("0.25")),
    (Decimal("500"), Decimal("0.50")),
    (Decimal("1000"), Decimal("1.00")),
    (Decimal("2500"), Decimal("2.50")),
)
#: ±10 % of the base price (06 §13 `daily_limit_pct`, 07 §6).
DAILY_LIMIT_PCT: Final = Decimal("0.10")
#: Universe rule U6: tick / price ≤ 0.25 % (06 §2, §13 `max_tick_to_price`).
MAX_TICK_TO_PRICE: Final = Decimal("0.0025")
#: Smaller than any tick: "strictly below p" for the step-down search.
_EPS: Final = Decimal("0.0001")


def tick_size(price: Decimal) -> Decimal:
    """The step of the range `price` falls in."""
    if price <= 0:
        raise ValueError("price must be positive")
    step = TICK_TABLE[0][1]
    for lower, tick in TICK_TABLE:
        if price >= lower:
            step = tick
    return step


def _to_grid(x: Decimal, rounding: str) -> Decimal:
    tick = tick_size(x)
    return (x / tick).to_integral_value(rounding=rounding) * tick


def floor_to_tick(x: Decimal) -> Decimal:
    """The largest valid price ≤ x (range lower bounds are multiples of their own step, so it stays in range)."""
    return _to_grid(x, ROUND_FLOOR).quantize(Decimal("0.01"))


def ceil_to_tick(x: Decimal) -> Decimal:
    """The smallest valid price ≥ x."""
    return _to_grid(x, ROUND_CEILING).quantize(Decimal("0.01"))


def step_down(price: Decimal) -> Decimal:
    """One tick below a valid price; at a range boundary the step of the range below applies (50.00 → 49.98)."""
    return floor_to_tick(price - _EPS)


def price_limits(base: Decimal, pct: Decimal = DAILY_LIMIT_PCT) -> tuple[Decimal, Decimal]:
    """(taban, tavan) of a session whose base price (baz fiyat, the previous close) is `base`."""
    if base <= 0:
        raise ValueError("base price must be positive")
    return ceil_to_tick(base * (1 - pct)), floor_to_tick(base * (1 + pct))


def tick_ratio_ok(price: Decimal, limit: Decimal = MAX_TICK_TO_PRICE) -> bool:
    """U6: the price step is at most 0.25 % of the price."""
    return tick_size(price) / price <= limit


def limit_up_locked(high: Decimal | None, low: Decimal | None, close: Decimal, upper: Decimal) -> bool:
    """07 §6 approximation of a session locked at the ceiling: high = low = close = tavan."""
    return high is not None and low is not None and high == low == close == upper


__all__ = [
    "DAILY_LIMIT_PCT",
    "MAX_TICK_TO_PRICE",
    "TICK_TABLE",
    "ceil_to_tick",
    "floor_to_tick",
    "limit_up_locked",
    "price_limits",
    "step_down",
    "tick_ratio_ok",
    "tick_size",
]
