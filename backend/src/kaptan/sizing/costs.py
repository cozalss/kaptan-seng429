"""Volatility, ATR stop and the cost model of one order (06 §6.1, §8.1). Pure.

Bars are the split/bonus-adjusted daily series (P8: returns and ranges from the adjusted series) and
are converted to the raw level of the last bar, so ATR is in today's TL. Per side (§8.1):

    commission  = c_broker × (1 + BSMV)
    fees        = exchange fee + clearing fee
    half_spread = median(Corwin–Schultz 2-day high-low spread, last 20 sessions) / 2
    impact      = Y × σ_daily × √(Q / ADV20_shares)
    (+ manual slippage, personal mode only)
    round_trip_used = max(2 × cost_side, floor_rt)
"""

from __future__ import annotations

import itertools
import math
import statistics
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import NamedTuple

from kaptan.sizing.params import DEFAULT_SIZING, SizingParams

#: 3 − 2√2, the Corwin–Schultz denominator.
_CS_K = 3 - 2 * math.sqrt(2)


class HLC(NamedTuple):
    high: float | None
    low: float | None
    close: float


def _valid(b: HLC) -> bool:
    return b.high is not None and b.low is not None and b.low > 0 and b.high >= b.low


def cs_spread(prev: HLC, cur: HLC) -> float | None:
    """Corwin & Schultz (2012) spread from two consecutive sessions, with the overnight adjustment;
    a negative estimate is set to 0 (as in the paper)."""
    if not (_valid(prev) and _valid(cur)):
        return None
    h0, l0 = float(prev.high or 0), float(prev.low or 0)
    h1, l1 = float(cur.high or 0), float(cur.low or 0)
    c0 = prev.close
    if c0 > h1:  # gap up overnight: shift day 2's range by the gap
        h1, l1 = h1 + (c0 - h1), l1 + (c0 - h1)
    elif c0 < l1:
        h1, l1 = h1 - (l1 - c0), l1 - (l1 - c0)
    if l1 <= 0:
        return None
    beta = math.log(h0 / l0) ** 2 + math.log(h1 / l1) ** 2
    gamma = math.log(max(h0, h1) / min(l0, l1)) ** 2
    alpha = (math.sqrt(2 * beta) - math.sqrt(beta)) / _CS_K - math.sqrt(gamma / _CS_K)
    spread = 2 * (math.exp(alpha) - 1) / (1 + math.exp(alpha))
    return max(spread, 0.0)


def median_cs_spread(bars: Sequence[HLC], window: int, min_obs: int) -> float | None:
    """Median of the 2-day estimates over the last `window` pairs (§8.1 "20 seans medyanı")."""
    tail = list(bars[-(window + 1) :])
    estimates = [s for a, b in itertools.pairwise(tail) if (s := cs_spread(a, b)) is not None]
    return statistics.median(estimates) if len(estimates) >= min_obs else None


def atr(bars: Sequence[HLC], window: int, min_obs: int) -> float | None:
    """Average True Range over the last `window` sessions (simple mean, §6.1 "20 seanslık ATR")."""
    tail = list(bars[-(window + 1) :])
    trs = []
    for prev, cur in itertools.pairwise(tail):
        if not _valid(cur):
            continue
        h, lo = float(cur.high or 0), float(cur.low or 0)
        trs.append(max(h - lo, abs(h - prev.close), abs(lo - prev.close)))
    return math.fsum(trs) / len(trs) if len(trs) >= min_obs else None


def daily_sigma(bars: Sequence[HLC], window: int, min_obs: int) -> float | None:
    """Sample sd of close-to-close returns over the last `window` sessions."""
    tail = list(bars[-(window + 1) :])
    rets = [b.close / a.close - 1 for a, b in itertools.pairwise(tail) if a.close > 0]
    return statistics.stdev(rets) if len(rets) >= min_obs and len(rets) > 1 else None


def stop_pct(event_type: str, atr_try: Decimal, entry_price: Decimal, p: SizingParams = DEFAULT_SIZING) -> Decimal:
    """§6.1: clamp(k × ATR20 / entry, lo, hi) per event type."""
    rule = p.stops[event_type]
    raw = rule.k * atr_try / entry_price
    return min(max(raw, rule.lo), rule.hi)


@dataclass(frozen=True, slots=True)
class CostBreakdown:
    commission: Decimal
    fees: Decimal
    half_spread: Decimal
    impact: Decimal
    manual_slippage: Decimal
    cost_side: Decimal
    round_trip: Decimal
    round_trip_used: Decimal

    @property
    def floored(self) -> bool:
        return self.round_trip_used > self.round_trip


def cost_model(
    *,
    spread: Decimal,
    sigma_daily: Decimal,
    order_shares: Decimal,
    adv20_shares: Decimal,
    personal: bool = False,
    p: SizingParams = DEFAULT_SIZING,
) -> CostBreakdown:
    if adv20_shares <= 0:
        raise ValueError("ADV20 must be positive")
    commission = p.c_broker * (1 + p.bsmv)
    fees = p.exchange_fee + p.clearing_fee
    half = spread / 2
    impact = p.impact_y * sigma_daily * (order_shares / adv20_shares).sqrt()
    slip = p.manual_slippage if personal else Decimal(0)
    side = commission + fees + half + impact + slip
    rt = 2 * side
    return CostBreakdown(commission, fees, half, impact, slip, side, rt, max(rt, p.floor_round_trip))
