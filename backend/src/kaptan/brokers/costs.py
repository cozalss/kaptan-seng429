"""SimBIST's pure pieces: BIST tick sizes and daily price limits, the 06 §8 slippage/impact model and the
fill decision for one limit order against one observed raw price.

Everything is Decimal; prices are raw İş Yatırım levels (P8). No I/O here (kaptan.brokers.fills reads
the bars and calls these).
"""

from __future__ import annotations

import itertools
import math
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, Decimal
from statistics import median, pstdev
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
    """Tavan: prev close × (1 + 10 %), rounded down to the tick."""
    return _to_tick(prev_close * (1 + pct), ROUND_FLOOR)


def limit_down(prev_close: Decimal, pct: Decimal) -> Decimal:
    """Taban: prev close × (1 − 10 %), rounded up to the tick."""
    return _to_tick(prev_close * (1 - pct), ROUND_CEILING)


def corwin_schultz(highs_lows: Sequence[tuple[Decimal, Decimal]]) -> float | None:
    """Median Corwin–Schultz (2012) spread over consecutive (high, low) pairs; None with < 2 days."""
    spreads: list[float] = []
    for (h1, l1), (h2, l2) in itertools.pairwise(highs_lows):
        if min(h1, l1, h2, l2) <= 0:
            continue
        beta = math.log(h1 / l1) ** 2 + math.log(h2 / l2) ** 2
        gamma = math.log(max(h1, h2) / min(l1, l2)) ** 2
        alpha = (math.sqrt(2 * beta) - math.sqrt(beta)) / _CS_DEN - math.sqrt(gamma / _CS_DEN)
        spread = 2 * (math.exp(alpha) - 1) / (1 + math.exp(alpha))
        spreads.append(max(0.0, spread))
    return median(spreads) if spreads else None


def daily_sigma(closes: Sequence[Decimal]) -> float | None:
    """Standard deviation of close-to-close log returns; None with < 3 closes."""
    rets = [math.log(b / a) for a, b in itertools.pairwise(closes) if a > 0 and b > 0]
    return pstdev(rets) if len(rets) >= 2 else None


@dataclass(frozen=True, slots=True)
class Liquidity:
    """What the slippage model needs about a ticker (any of it may be unknown).

    `half_spread` = Corwin–Schultz spread / 2 (06 §8.1)."""

    half_spread: float | None = None
    sigma_daily: float | None = None
    adv20_shares: float | None = None


def slippage(qty: int, liq: Liquidity, costs: Costs) -> Decimal:
    """Per-side slippage as a ratio: max(floor, half spread + Y × σ × sqrt(Q / ADV20 shares))."""
    half = Decimal(str(liq.half_spread)) if liq.half_spread is not None else costs.default_half_spread
    impact = Decimal(0)
    if liq.sigma_daily is not None and liq.adv20_shares and liq.adv20_shares > 0:
        impact = costs.impact_y * Decimal(str(liq.sigma_daily)) * Decimal(str(math.sqrt(qty / liq.adv20_shares)))
    return max(costs.slip_floor_bps / BPS, half + impact)


@dataclass(frozen=True, slots=True)
class FillQuote:
    price: Decimal
    slippage_bps: Decimal
    commission: Decimal
    bsmv: Decimal


@dataclass(frozen=True, slots=True)
class Miss:
    reason: MissReason


def commission_of(notional: Decimal, costs: Costs) -> tuple[Decimal, Decimal]:
    """(commission incl. exchange/Takasbank fees, BSMV on the broker commission), in kuruş."""
    broker = notional * costs.c_broker
    commission = (broker + notional * costs.fees_side).quantize(CENT, rounding=ROUND_HALF_UP)
    bsmv = (broker * costs.bsmv).quantize(CENT, rounding=ROUND_HALF_UP)
    return commission, bsmv


def decide_fill(
    *,
    side: Side,
    qty: int,
    limit: Decimal,
    observed: Decimal | None,
    prev_close: Decimal | None,
    liq: Liquidity,
    costs: Costs,
    at_open: bool,
) -> FillQuote | Miss:
    """One limit order against one observed raw price (the open, or the next available price).

    No price → miss. At the open: a buy that opens locked at the upper limit (tavan) or a sell at the
    lower limit (taban) does not fill. A buy whose price is above its limit (a sell below) is missed;
    there is no retry (06 §5). Otherwise the fill is the price moved by slippage + impact against us,
    never through the limit.
    """
    if observed is None:
        return Miss("no_price")
    if at_open and prev_close is not None:
        if side == "buy" and observed >= limit_up(prev_close, costs.price_limit_pct):
            return Miss("limit_up_open")
        if side == "sell" and observed <= limit_down(prev_close, costs.price_limit_pct):
            return Miss("limit_down_open")
    if side == "buy" and observed > limit:
        return Miss("open_above_limit")
    if side == "sell" and observed < limit:
        return Miss("open_below_limit")
    slip = slippage(qty, liq, costs)
    moved = observed * (1 + slip) if side == "buy" else observed * (1 - slip)
    price = (min(moved, limit) if side == "buy" else max(moved, limit)).quantize(CENT, rounding=ROUND_HALF_UP)
    commission, bsmv = commission_of(price * qty, costs)
    bps = ((price / observed - 1) * BPS).copy_abs().quantize(CENT, rounding=ROUND_HALF_UP)
    return FillQuote(price=price, slippage_bps=bps, commission=commission, bsmv=bsmv)
