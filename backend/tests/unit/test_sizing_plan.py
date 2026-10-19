"""The live sizer by hand (06 §5, §6.1, §7.1, §8): one case per entry type, the cost breakdown, the
edge shrinkage, limit-up handling, and edge/cost < 2 never proposing."""

from __future__ import annotations

import math
from datetime import date, datetime
from decimal import Decimal as D  # noqa: N817
from typing import Any

import pytest

from kaptan.evidence.stats import summarize
from kaptan.evidence.study import MARKET_ADJUSTED, EventResult, PastEvent, StudyResult
from kaptan.prices.calendar import IST
from kaptan.rules import RuleInput, decide
from kaptan.rules.sizing import SizingInput, size
from kaptan.sizing import SizingInputs, SizingPlan, Unknown, plan_sizing
from kaptan.sizing.costs import HLC, cost_model
from kaptan.sizing.plan import at_limit, budget, evidence_multiplier, limit_price

EQUITY = D(1_000_000)
ADV = D(80_000_000)
UPPER = D("110.00")  # price_limits(100) on the tick grid


def ist(d: str, hh: int, mm: int = 0) -> datetime:
    y, m, dd = (int(x) for x in d.split("-"))
    return datetime(y, m, dd, hh, mm, tzinfo=IST)


def bars(high: float, low: float, close: float = 100.0, n: int = 21) -> tuple[HLC, ...]:
    return tuple(HLC(high, low, close) for _ in range(n))


def study(car: float, n: int) -> StudyResult:
    ev = PastEvent("evt:x", "TSTAA", "TSTAA A.Ş.", "t", ist("2025-01-02", 11), ist("2025-01-02", 11))
    results = tuple(EventResult(ev, date(2025, 1, 3), {1: car, 5: car, 20: car}, MARKET_ADJUSTED) for _ in range(n))
    return StudyResult((1, 5, 20), results, {h: summarize(h, [car] * n) for h in (1, 5, 20)}, n_raw=n)


def inputs(event: str, t_pub: datetime, t_dec: datetime, **kw: Any) -> SizingInputs:
    base: dict[str, Any] = {
        "event_type": event,
        "t_pub": t_pub,
        "t_dec": t_dec,
        "ref_price": D("100.00"),
        "p_pre": D("100.00"),
        "bars": bars(100.2, 99.8),
        "raw_last_close": D("100.00"),
        "adv20_try": ADV,
        "type_study": study(0.03, 30),
        "firm_study": study(0.05, 5),
    }
    return SizingInputs(**(base | kw))


def cs(high: float, low: float) -> float:
    """Corwin–Schultz for two identical sessions inside each other's range: α = ln(H/L) exactly."""
    b = math.log(high / low)
    return 2 * (math.exp(b) - 1) / (1 + math.exp(b))


def plan(x: SizingInputs, **kw: Any) -> SizingPlan:
    out = plan_sizing(x, equity_try=EQUITY, upper_limit=kw.pop("upper", UPPER), **kw)
    assert isinstance(out, SizingPlan), out
    return out


def test_e1_after_the_close_goes_to_the_next_open_with_a_clamped_stop() -> None:
    p = plan(inputs("E1", ist("2026-10-14", 19), ist("2026-10-14", 19, 1)))
    assert (p.entry.entry, p.entry.session, p.entry.rule) == ("next_open_auction", date(2026, 10, 15), "after_close")
    assert p.atr_try == D("0.4")  # TR = H − L = 0.4 every session
    assert p.stop_pct == D("0.05")  # 2.5 × 0.4 / 100 = 1 % → clamped up to E1's 5 %
    assert p.requested_notional_try == D(100_000)  # min(1e6 × 0.5 % / 5 %, 1e6 × 10 %, 1 % × 80 m)
    assert p.limit_price == D("102.00")  # min(⌊100 × 1.02⌋ = 102.00, 110.00 − 0.10)
    half = D(str(cs(100.2, 99.8))) / 2
    c = p.costs
    assert (c.commission, c.fees, c.impact, c.manual_slippage) == (D("0.000525"), D("0.0000254"), 0, 0)
    assert c.half_spread == half and c.cost_side == D("0.000525") + D("0.0000254") + half
    assert c.round_trip_used == c.round_trip == 2 * c.cost_side and not c.floored
    assert p.est_cost_bps == math.ceil(float(c.round_trip) * 10_000) == 52
    # edge: w = 5 / 25; raw = 0.2 × 5 % + 0.8 × 3 % = 3.4 %; × 0.5 = 1.7 %
    assert (p.edge.horizon, p.edge.weight, p.edge.edge_raw) == (20, D("0.2"), D("0.034"))
    assert p.expected_edge_bps == 170 and p.holding_days == (20, 40) and p.evidence_multiplier == 1
    assert p.tool_doc() == {
        "ref_price": 100,
        "stop_pct": 0.05,
        "holding_days": [20, 40],
        "expected_edge_bps": 170,
        "est_cost_bps": 52,
        "requested_notional_try": 100_000,
        "entry": "next_open_auction",
        "escalate": [],
        "limit_price": 102,
        "evidence_multiplier": 1,
    }


def test_e2_pre_open_with_the_atr_stop_inside_its_band() -> None:
    x = inputs("E2", ist("2026-10-14", 8), ist("2026-10-14", 8, 2), bars=bars(101.6, 98.4))
    p = plan(x)
    assert (p.entry.entry, p.entry.session, p.entry.rule) == ("next_open_auction", date(2026, 10, 14), "pre_open")
    assert p.stop_pct == D("2.5") * D("3.2") / 100 == D("0.08")
    assert p.requested_notional_try == D(62_500)  # 1e6 × 0.5 % / 8 %
    assert p.holding_days == (20, 60)


def test_e3_intraday_when_calm_with_type_level_precedents() -> None:
    x = inputs(
        "E3",
        ist("2026-10-14", 11),
        ist("2026-10-14", 11, 2),
        ref_price=D("101.00"),
        firm_study=study(0.06, 3),
        type_study=study(0.02, 30),
    )
    p = plan(x)
    assert (p.entry.entry, p.entry.rule) == ("intraday_limit", "e3_intraday")
    assert p.entry.not_before == ist("2026-10-14", 11, 15)  # t_pub + 15 min
    assert p.stop_pct == D("0.04")  # 2 × 0.4 / 101 → clamped to E3's 4 %
    assert p.limit_price == D("103.00")  # ⌊103.02⌋ on the 0.10 grid
    assert p.evidence_multiplier == D("0.25")  # m_evidence 0.5 × 0.5 (fewer than 5 own precedents)
    # H = 5: w = 3 / 23 → raw = (3 × 6 % + 20 × 2 %) / 23
    assert p.edge.horizon == 5 and float(p.edge.edge_raw) == pytest.approx((3 * 0.06 + 20 * 0.02) / 23)
    assert p.expected_edge_bps == 126 and p.holding_days == (5, 5)


def test_e3_moved_or_near_the_ceiling_waits_for_the_next_open() -> None:
    moved = plan(inputs("E3", ist("2026-10-14", 11), ist("2026-10-14", 11, 2), ref_price=D("104.50")))
    assert (moved.entry.entry, moved.entry.rule) == ("next_open_auction", "e3_moved_next_open")
    # limit-up: last 109.50 ≥ 110 × 0.99 → no intraday buy; the limit stays one tick under the ceiling
    near = plan(inputs("E3", ist("2026-10-14", 11), ist("2026-10-14", 11, 2), ref_price=D("109.50"), p_pre=D("108")))
    assert near.entry.entry == "next_open_auction" and near.limit_price == D("109.90")
    locked = plan(inputs("E1", ist("2026-10-14", 19), ist("2026-10-14", 19, 1), ref_price=D("110.00")))
    assert locked.limit_price == D("109.90") < locked.ref_price  # R09 then rejects NEAR_UPPER


def test_e4_auction_window_and_wide_atr_hits_the_upper_clamp() -> None:
    x = inputs("E4", ist("2026-10-14", 9, 45), ist("2026-10-14", 9, 50), bars=bars(103, 97))
    p = plan(x)
    assert (p.entry.entry, p.entry.session, p.entry.rule) == (
        "next_open_auction",
        date(2026, 10, 14),
        "auction_reachable",
    )
    assert p.stop_pct == D("0.08")  # 2 × 6 / 100 = 12 % → E4's 8 % ceiling
    assert p.evidence_multiplier == D("0.7") and p.holding_days == (5, 10)
    late = plan(inputs("E4", ist("2026-10-14", 9, 45), ist("2026-10-14", 9, 58), bars=bars(103, 97)))
    assert (late.entry.entry, late.entry.rule) == ("intraday_limit", "auction_missed_continuous")


def test_unknown_inputs_are_never_guessed() -> None:
    t, d = ist("2026-10-14", 19), ist("2026-10-14", 19, 1)
    cases = {
        "no_price": inputs("E1", t, d, ref_price=None),
        "missed": inputs("E1", t, ist("2026-10-15", 10, 30)),  # the 09:55 auction already collected
        "no_atr": inputs("E1", t, d, bars=bars(100.2, 99.8, n=10)),
        "no_adv": inputs("E1", t, d, adv20_try=None),
        "no_evidence": inputs("E1", t, d, type_study=None),
        "not_an_event": inputs("IGNORE", t, d),
    }
    for reason, x in cases.items():
        out = plan_sizing(x, equity_try=EQUITY, upper_limit=UPPER)
        assert out == Unknown(reason), reason
    no_hl = inputs("E1", t, d, bars=tuple(HLC(None, None, 100.0) for _ in range(21)))
    assert plan_sizing(no_hl, equity_try=EQUITY, upper_limit=UPPER) == Unknown("no_atr")
    flat_spread = inputs("E1", t, d, bars=(*bars(100.2, 99.8, n=20), HLC(100.2, 99.8, 100.0)))
    assert isinstance(plan_sizing(flat_spread, equity_try=EQUITY, upper_limit=UPPER), SizingPlan)


def test_cost_breakdown_floor_and_personal_slippage() -> None:
    c = cost_model(spread=D("0.004"), sigma_daily=D("0.02"), order_shares=D(1_000), adv20_shares=D(100_000))
    assert c.half_spread == D("0.002") and c.impact == D("0.7") * D("0.02") * D("0.1")
    assert c.cost_side == D("0.000525") + D("0.0000254") + D("0.002") + D("0.0014")
    assert c.round_trip_used == c.round_trip == D("0.0079008")
    tiny = cost_model(spread=D(0), sigma_daily=D(0), order_shares=D(1), adv20_shares=D(1_000))
    assert tiny.round_trip == D("0.0011008") and tiny.round_trip_used == D("0.003") and tiny.floored
    personal = cost_model(spread=D(0), sigma_daily=D(0), order_shares=D(1), adv20_shares=D(1), personal=True)
    assert personal.manual_slippage == D("0.0005") and personal.cost_side == D("0.0010504")
    with pytest.raises(ValueError, match="ADV20"):
        cost_model(spread=D(0), sigma_daily=D(0), order_shares=D(1), adv20_shares=D(0))


def test_budget_limit_and_multiplier_helpers() -> None:
    assert budget(EQUITY, D("0.004"), ADV) == D(100_000)  # capped by 10 % of equity
    assert budget(EQUITY, D("0.05"), D(3_000_000)) == D(30_000)  # capped by 1 % of ADV
    assert limit_price(D("49.50"), D("50.00")) == D("49.98")  # 50.49 → 50.45 vs one 0.02 step under 50.00
    assert limit_price(D("40.00"), None) == D("40.80")
    assert evidence_multiplier("E3", 7) == D("0.5") and evidence_multiplier("E2", 0) == 1
    x = SizingInput(D("100"), D("0.05"), D(100_000), skeptic_multiplier=D("0.5"), evidence_multiplier=D("0.7"))
    s = at_limit(size(x), x, D("101.90"))
    assert (s.limit_price, s.qty, s.final_notional_try) == (D("101.90"), 343, D("101.90") * 343)  # ⌊35 000 / 101.9⌋


def _rules(edge: int, cost: int) -> Any:
    return decide(
        RuleInput(
            event_type="E1",
            ticker="TSTAA",
            agent_status=(("classifier", "ok"), ("reader", "ok"), ("materiality", "ok"), ("evidence", "ok")),
            classifier_confidence=1.0,
            reader_confidence=0.9,
            materiality_confidence=0.9,
            e1_nature="execution",
            buyback_10d_capital_pct=0.003,
            buyback_10d_notice_count=2,
            buyback_sale_within_20d=False,
            leakage_5d=0.01,
            expected_edge_bps=edge,
            est_cost_bps=cost,
            evidence_n=8,
            evidence_card_id="card-x",
        )
    )


def test_edge_below_twice_the_cost_never_proposes() -> None:
    good = plan(inputs("E1", ist("2026-10-14", 19), ist("2026-10-14", 19, 1)))
    assert _rules(good.expected_edge_bps, good.est_cost_bps).outcome == "PROPOSE"  # 170 ≥ 2 × 52
    wide = plan(inputs("E1", ist("2026-10-14", 19), ist("2026-10-14", 19, 1), bars=bars(104, 96)))
    assert wide.est_cost_bps > 700 and wide.expected_edge_bps < 2 * wide.est_cost_bps
    res = _rules(wide.expected_edge_bps, wide.est_cost_bps)
    assert res.outcome != "PROPOSE" and "EDGE_BELOW_COST" in res.reason_codes
