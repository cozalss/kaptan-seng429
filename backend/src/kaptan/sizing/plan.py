"""The live sizer: entry, limit, stop, budget, cost and edge of one proposal (06 §5, §6.1, §7.1, §8). Pure.

    ref_price        = last raw price known at the decision (pre-open: the previous close)       §5
    limit_price      = min(⌊ref × 1.02⌋_tick, tavan − 1 tick)                                    §5, R09
    stop_pct         = clamp(k × ATR20 / ref, lo, hi) per type                                    §6.1
    requested        = min(equity × 0.5 % / stop_pct, equity × 10 %, 1 % × ADV20)   (TL, floor)   §7.1
    m_evidence       = {E1 1, E2 1, E3 0.5, E4 0.7}; E3 with < 5 own precedents × 0.5            §7.1, §3.3
    est_cost_bps     = ⌈round_trip_used × 10⁴⌉                                                     §8.1
    expected_edge    = ⌊edge_adj × 10⁴⌋                                                             §8.2
The skeptic / leakage / regime multipliers are applied later by `kaptan.rules.size` (decide), the gate
(R06/R07) re-checks edge ≥ 2 × cost and the size. Anything the data cannot give → `Unknown` (HOLD).

`SizingPlan.tool_doc()` has exactly the keys of the replay fixtures' `sizing` answer, plus the
tick-valid `limit_price` and `evidence_multiplier` that decide applies when present.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, Decimal
from typing import Any, Final

from kaptan.evidence.study import StudyResult
from kaptan.market.ticks import floor_to_tick, step_down
from kaptan.rules.sizing import Sizing, SizingInput
from kaptan.sizing.costs import HLC, CostBreakdown, atr, cost_model, daily_sigma, median_cs_spread, stop_pct
from kaptan.sizing.edge import EdgeEstimate, shrunk_edge
from kaptan.sizing.entry import EntryPlan, entry_plan
from kaptan.sizing.params import DEFAULT_SIZING, SizingParams

BPS: Final = Decimal(10_000)
CENT: Final = Decimal("0.01")
STOP_DIGITS: Final = Decimal("0.0001")  # the stop % the proposal carries (and decide re-reads)
ATR_DIGITS: Final = Decimal("0.0001")


@dataclass(frozen=True, slots=True)
class SizingInputs:
    """What the SQL loaded for one decision (`kaptan.sizing.load`), all known at `t_dec`."""

    event_type: str
    t_pub: datetime
    t_dec: datetime
    ref_price: Decimal | None  # last raw price known at t_dec
    p_pre: Decimal | None  # last raw price known at t_pub (E3 intraday move)
    bars: tuple[HLC, ...]  # adjusted daily bars, oldest first, last = last session closed before t_dec
    raw_last_close: Decimal | None  # raw close of the last bar (scales the adjusted ATR to TL)
    adv20_try: Decimal | None
    type_study: StudyResult | None
    firm_study: StudyResult | None


@dataclass(frozen=True, slots=True)
class Unknown:
    reason: str  # no_price | missed | no_atr | no_volatility | no_spread | no_adv | no_evidence | ...


@dataclass(frozen=True, slots=True)
class SizingPlan:
    event_type: str
    entry: EntryPlan
    ref_price: Decimal
    limit_price: Decimal
    atr_try: Decimal
    stop_pct: Decimal
    requested_notional_try: Decimal
    evidence_multiplier: Decimal
    costs: CostBreakdown
    edge: EdgeEstimate
    holding_days: tuple[int, int]

    @property
    def expected_edge_bps(self) -> int:
        return int((self.edge.edge_adj * BPS).to_integral_value(rounding=ROUND_FLOOR))

    @property
    def est_cost_bps(self) -> int:
        return int((self.costs.round_trip_used * BPS).to_integral_value(rounding=ROUND_CEILING))

    def tool_doc(self) -> dict[str, Any]:
        return {
            "ref_price": _num(self.ref_price.quantize(CENT, rounding=ROUND_HALF_UP)),
            "stop_pct": float(self.stop_pct),
            "holding_days": list(self.holding_days),
            "expected_edge_bps": self.expected_edge_bps,
            "est_cost_bps": self.est_cost_bps,
            "requested_notional_try": int(self.requested_notional_try),
            "entry": self.entry.entry,
            "escalate": [],
            "limit_price": _num(self.limit_price),
            "evidence_multiplier": _num(self.evidence_multiplier),
        }


def _num(x: Decimal) -> int | float:
    return int(x) if x == x.to_integral_value() else float(x)


def limit_price(ref: Decimal, upper: Decimal | None, p: SizingParams = DEFAULT_SIZING) -> Decimal:
    """§5 `min(ref × 1.02, upper − 1 tick)` on the BIST tick grid (never above either bound)."""
    limit = floor_to_tick(ref * p.limit_markup)
    return limit if upper is None else min(limit, step_down(upper))


def at_limit(s: Sizing, x: SizingInput, limit: Decimal) -> Sizing:
    """`kaptan.rules.size` re-done at the live sizer's tick-valid limit: qty = ⌊budget × Π m / limit⌋."""
    scaled = x.requested_notional_try
    for m in (x.skeptic_multiplier, x.leakage_multiplier, x.regime_multiplier, x.evidence_multiplier):
        scaled *= m
    qty = int((scaled / limit).to_integral_value(rounding=ROUND_FLOOR))
    return Sizing(limit_price=limit, stop_price=s.stop_price, qty=qty, final_notional_try=limit * qty)


def budget(equity: Decimal, stop: Decimal, adv20: Decimal, p: SizingParams = DEFAULT_SIZING) -> Decimal:
    """§7.1 before the multipliers: risk budget / stop, capped by P2 (10 % of equity) and P10 (1 % ADV)."""
    caps = (equity * p.risk_per_trade / stop, equity * p.max_pos, adv20 * p.max_adv)
    return min(caps).to_integral_value(rounding=ROUND_FLOOR)


def evidence_multiplier(event_type: str, n_firm: int, p: SizingParams = DEFAULT_SIZING) -> Decimal:
    m = p.m_evidence[event_type]
    if event_type == "E3" and n_firm < p.precedent_min_n:
        m *= p.precedent_fallback_mult  # §3.3 precedent_ok on the type level only
    return m


def plan_sizing(
    x: SizingInputs,
    *,
    equity_try: Decimal,
    upper_limit: Decimal | None,
    personal: bool = False,
    p: SizingParams = DEFAULT_SIZING,
) -> SizingPlan | Unknown:
    if x.event_type not in p.stops:
        return Unknown("not_an_event")
    if x.ref_price is None or x.ref_price <= 0:
        return Unknown("no_price")
    near_upper = upper_limit is not None and x.ref_price >= upper_limit * (1 - p.near_limit)
    entry = entry_plan(
        x.event_type, x.t_pub, x.t_dec, p_pre=x.p_pre, p_now=x.ref_price, near_upper=near_upper, params=p
    )
    if entry is None:
        return Unknown("missed")
    atr_adj = atr(x.bars, p.atr_window, p.min_window_obs)
    if atr_adj is None or x.raw_last_close is None or not x.bars or x.bars[-1].close <= 0:
        return Unknown("no_atr")
    atr_try = (Decimal(str(atr_adj)) * x.raw_last_close / Decimal(str(x.bars[-1].close))).quantize(ATR_DIGITS)
    sigma = daily_sigma(x.bars, p.atr_window, p.min_window_obs)
    if sigma is None:
        return Unknown("no_volatility")
    spread = median_cs_spread(x.bars, p.atr_window, p.min_window_obs)
    if spread is None:
        return Unknown("no_spread")
    if x.adv20_try is None or x.adv20_try <= 0 or equity_try <= 0:
        return Unknown("no_adv")
    edge = shrunk_edge(x.event_type, x.type_study, x.firm_study, p)
    if edge is None:
        return Unknown("no_evidence")
    stop = stop_pct(x.event_type, atr_try, x.ref_price, p).quantize(STOP_DIGITS, rounding=ROUND_HALF_UP)
    requested = budget(equity_try, stop, x.adv20_try, p)
    limit = limit_price(x.ref_price, upper_limit, p)
    if requested <= 0 or limit <= 0:
        return Unknown("too_small")
    costs = cost_model(
        spread=Decimal(str(spread)),
        sigma_daily=Decimal(str(sigma)),
        order_shares=requested / x.ref_price,
        adv20_shares=x.adv20_try / x.ref_price,
        personal=personal,
        p=p,
    )
    return SizingPlan(
        event_type=x.event_type,
        entry=entry,
        ref_price=x.ref_price,
        limit_price=limit,
        atr_try=atr_try,
        stop_pct=stop,
        requested_notional_try=requested,
        evidence_multiplier=evidence_multiplier(x.event_type, edge.n_firm, p),
        costs=costs,
        edge=edge,
        holding_days=p.holding[x.event_type],
    )
