"""06 §10 table cases the first gate missed: SELL exits are never blocked by buy-only rules, R04 stale data
rejects buys, R07 cost-aware cash cap + TOO_SMALL, R08 gross exposure (P5) and cash buffer (P6), R12 held
quantity and no leverage at send, R14 missing reader amount, R15 RESTRICTED_SELL."""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

from kaptan.risk.gate import (
    GateContext,
    GateLimits,
    GateOrder,
    evaluate,
    evaluate_at_send,
    r04,
    r07,
    r08,
    r09,
    r10,
    r12,
    r14,
)

LIM = GateLimits()
BUY = GateOrder(
    ticker="THYAO",
    event_type="E1",
    qty=1428,
    limit_price=Decimal(40),
    stop_pct=Decimal("0.0875"),
    reader_amount=Decimal(125_000_000),
    regex_amounts=(Decimal(125_000_000), Decimal(3_000_000)),
)
CTX = GateContext(
    equity_try=Decimal(1_000_000),
    last_price=Decimal(40),
    adv20_try=Decimal(80_000_000),
    cash_free_try=Decimal(1_000_000),
    upper_limit=Decimal(44),
    lower_limit=Decimal(36),
)
SELL = replace(BUY, side="sell", qty=100, limit_price=Decimal(36))


def test_r04_sell_passes_even_with_hard_restrictions_and_stale_data() -> None:
    ctx = replace(CTX, restrictions=("spk_tedbir",), restrictions_age_h=30.0)
    assert r04(SELL, ctx, LIM, "pre_trade").outcome == "pass"


def test_r04_stale_restriction_data_rejects_a_buy() -> None:
    res = r04(BUY, replace(CTX, restrictions_age_h=30.0), LIM, "pre_trade")
    assert res.outcome == "reject"
    assert "24 saatten eski" in res.detail_tr


def test_r09_sell_at_the_lower_limit_passes_and_below_it_rejects() -> None:
    near_floor = replace(CTX, last_price=Decimal(36))
    assert r09(SELL, near_floor, LIM, "at_send").outcome == "pass"  # 06 R09 case 5
    far = r09(SELL, CTX, LIM, "at_send")  # −10 % from last: outside ±2 % but ≥ taban → exits allowed
    assert far.outcome == "pass"
    below = r09(replace(SELL, limit_price=Decimal("35.9")), CTX, LIM, "at_send")
    assert below.outcome == "reject"
    stale = r09(SELL, replace(CTX, price_age_s=1_500.0), LIM, "at_send")
    assert stale.outcome == "hold"


def test_an_exit_sell_at_taban_passes_r16() -> None:
    ctx = replace(CTX, holds_ticker=True, held_qty=100, kill_switch_on=True, restrictions=("spk_tedbir",))
    assert evaluate_at_send(SELL, ctx).outcome == "pass"


def test_r07_cash_cap_includes_the_side_cost_and_too_small_rejects() -> None:
    poor = replace(CTX, cash_free_try=Decimal(5_000))
    res = r07(BUY, poor, LIM, "pre_trade")  # 06 R07 case 4: 124 lot × 40 < 10 000
    assert res.outcome == "reject"
    assert "küçük" in res.detail_tr
    capped = r07(replace(BUY, cost_side=Decimal("0.01")), replace(CTX, cash_free_try=Decimal(40_400)), LIM, "pre_trade")
    assert capped.new_qty is None or capped.new_qty <= 1000
    exact = r07(replace(BUY, qty=250), CTX, LIM, "pre_trade")
    assert exact.outcome == "pass"  # 10 000 TL = max(2 000, 1 % × 1 000 000): equality allowed


def test_r07_sells_are_not_sized() -> None:
    assert r07(replace(SELL, qty=10), CTX, LIM, "pre_trade").outcome == "pass"


def test_r08_gross_exposure_resizes_in_crisis_and_cash_buffer_holds() -> None:
    crisis = replace(CTX, regime="crisis", gross_exposure_pct=Decimal("0.48"))
    res = r08(replace(BUY, qty=2000), crisis, LIM, "pre_trade")  # 06 R08 case 5: 8 % asked → 2 %
    assert res.outcome == "resize"
    assert res.new_qty == 500
    full = r08(BUY, replace(CTX, gross_exposure_pct=Decimal(1)), LIM, "pre_trade")
    assert full.outcome == "reject"
    buffer = r08(replace(BUY, qty=2000), replace(CTX, cash_free_try=Decimal(60_000)), LIM, "pre_trade")
    assert buffer.outcome == "resize"
    assert buffer.new_qty == 250  # (60 000 − 5 % × 1 000 000) / 40
    no_cash = r08(BUY, replace(CTX, cash_free_try=Decimal(50_000)), LIM, "pre_trade")
    assert no_cash.outcome == "reject"


def test_r08_and_r10_pass_sells() -> None:
    held = replace(CTX, holds_ticker=True, n_open_positions=10, regime="crisis")
    assert r08(SELL, held, LIM, "pre_trade").outcome == "pass"
    assert r10(SELL, held, LIM, "pre_trade").outcome == "pass"


def test_r12_held_quantity_and_no_leverage_at_send() -> None:
    assert r12(SELL, replace(CTX, holds_ticker=True, held_qty=50), LIM, "at_send").outcome == "reject"
    assert r12(SELL, replace(CTX, holds_ticker=True, held_qty=100), LIM, "at_send").outcome == "pass"
    assert r12(SELL, replace(CTX, holds_ticker=True), LIM, "at_send").outcome == "pass"  # qty unknown
    broke = replace(CTX, cash_free_try=Decimal(1_000))
    lev = r12(replace(BUY, qty=100), broke, LIM, "at_send")
    assert lev.outcome == "reject"
    assert "Kaldıraç" in lev.detail_tr
    assert r12(replace(BUY, qty=100), broke, LIM, "pre_trade").outcome == "pass"  # R07 sizes to cash first


def test_r14_missing_reader_amount_rejects_e1_to_e3() -> None:
    assert r14(replace(BUY, reader_amount=None), CTX, LIM, "pre_trade").outcome == "reject"
    assert r14(replace(BUY, regex_amounts=()), CTX, LIM, "pre_trade").outcome == "reject"  # 06 R14 case 3
    assert r14(replace(BUY, event_type="E4", reader_amount=None), CTX, LIM, "pre_trade").outcome == "pass"


def test_r15_restricted_sell_escalates() -> None:
    ctx = replace(CTX, holds_ticker=True, held_qty=100, team_blocklisted=True)
    order = replace(SELL, limit_price=Decimal(40), evidence_ids=("a",) * 5, retrieved_ids=("a",))
    order = replace(order, expected_edge_bps=Decimal(100), est_cost_bps=Decimal(30))
    verdict = evaluate(order, ctx)
    assert "RESTRICTED_SELL" in verdict.escalation_reasons
