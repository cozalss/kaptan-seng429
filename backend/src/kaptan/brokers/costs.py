"""The pure pieces of the cost model: BIST tick sizes, daily price limits on the tick grid, and the commission of a
fill (06 §8.1: broker commission + exchange / Takasbank fees, BSMV on the commission) that estimates what a
ticket's fill cost when the person did not type it.

Everything is Decimal; prices are raw İş Yatırım levels (P8). No I/O here.
"""

from __future__ import annotations

import math
from decimal import ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, Decimal
from typing import Final, Literal

from kaptan.brokers.config import Costs

CENT: Final = Decimal("0.01")
BPS: Final = Decimal(10_000)
#: BIST equity tick table (Pay Piyasası fiyat adımları): (upper bound exclusive, tick).
TICKS: Final[tuple[tuple[Decimal, Decimal], ...]] = (
    (Decimal(20), Decimal("0.01")),
    (Decimal(50), Decimal("0.02")),
    (Decimal(100), Decimal("0.05")),
    (Decimal(250), Decimal("0.10")),
    (Decimal(500), Decimal("0.25")),
    (Decimal(1000), Decimal("0.50")),
    (Decimal(2500), Decimal("1.00")),
)
TOP_TICK: Final = Decimal("2.50")
_CS_DEN: Final = 3 - 2 * math.sqrt(2)

Side = Literal["buy", "sell"]
MissReason = Literal["open_above_limit", "open_below_limit", "limit_up_open", "limit_down_open", "no_price"]


def tick_size(price: Decimal) -> Decimal:
    for bound, tick in TICKS:
        if price < bound:
            return tick
    return TOP_TICK


def _to_tick(price: Decimal, rounding: str) -> Decimal:
    tick = tick_size(price)
    return ((price / tick).to_integral_value(rounding=rounding) * tick).quantize(CENT)


def limit_up(prev_close: Decimal, pct: Decimal) -> Decimal:
    """Tavan: prev close × (1 + pct), rounded down to the tick (pct = the market's band)."""
    return _to_tick(prev_close * (1 + pct), ROUND_FLOOR)


def limit_down(prev_close: Decimal, pct: Decimal) -> Decimal:
    """Taban: prev close × (1 − pct), rounded up to the tick (pct = the market's band)."""
    return _to_tick(prev_close * (1 - pct), ROUND_CEILING)


def commission_of(notional: Decimal, costs: Costs) -> tuple[Decimal, Decimal]:
    """(commission incl. exchange/Takasbank fees, BSMV on the broker commission), in kuruş."""
    broker = notional * costs.c_broker
    commission = (broker + notional * costs.fees_side).quantize(CENT, rounding=ROUND_HALF_UP)
    bsmv = (broker * costs.bsmv).quantize(CENT, rounding=ROUND_HALF_UP)
    return commission, bsmv
