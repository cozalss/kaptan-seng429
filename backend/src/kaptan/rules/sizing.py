"""Entry price and size of a proposal (06 §5 entry, §6.1 stop, §7.1 multipliers). Pure, Decimal.

`requested_notional_try` is the sizer's budget before the multipliers (equity × risk / stop, capped
at the position limit); the multipliers only ever shrink it: qty = ⌊budget × Π m / limit⌋.
The risk gate may shrink it further (R07/R08/R10) and never grows it.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal

from kaptan.rules.params import DEFAULT_PARAMS, RuleParams

CENT = Decimal("0.01")


def money(x: Decimal) -> Decimal:
    return x.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True, slots=True)
class SizingInput:
    ref_price: Decimal
    stop_pct: Decimal
    requested_notional_try: Decimal
    upper_limit: Decimal | None = None
    skeptic_multiplier: Decimal = Decimal(1)
    leakage_multiplier: Decimal = Decimal(1)
    regime_multiplier: Decimal = Decimal(1)
    evidence_multiplier: Decimal = Decimal(1)


@dataclass(frozen=True, slots=True)
class Sizing:
    limit_price: Decimal
    stop_price: Decimal
    qty: int
    final_notional_try: Decimal

    @property
    def is_empty(self) -> bool:
        return self.qty <= 0


def limit_price_of(ref: Decimal, upper_limit: Decimal | None, params: RuleParams = DEFAULT_PARAMS) -> Decimal:
    """limit = min(ref × 1.02, upper limit − 1 tick), rounded to kuruş (06 §5)."""
    limit = money(ref * params.limit_markup)
    if upper_limit is not None:
        limit = min(limit, money(upper_limit - params.tick))
    return limit


def size(x: SizingInput, params: RuleParams = DEFAULT_PARAMS) -> Sizing:
    if x.ref_price <= 0 or x.requested_notional_try <= 0:
        raise ValueError("ref_price and requested_notional_try must be positive")
    multipliers = (x.skeptic_multiplier, x.leakage_multiplier, x.regime_multiplier, x.evidence_multiplier)
    if any(m < 0 or m > 1 for m in multipliers):
        raise ValueError("multipliers must be within [0, 1]")
    limit = limit_price_of(x.ref_price, x.upper_limit, params)
    budget = x.requested_notional_try
    for m in multipliers:
        budget *= m
    qty = int((budget / limit).to_integral_value(rounding=ROUND_FLOOR))
    stop = money(x.ref_price * (1 - x.stop_pct))
    return Sizing(limit_price=limit, stop_price=stop, qty=qty, final_notional_try=limit * qty)
