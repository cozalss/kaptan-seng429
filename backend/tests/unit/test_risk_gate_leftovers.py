"""M4 package R: P8 cooldown in the gate, crisis ≤ 1 entry/day, m_reset ×0,5, security kill (06 §7.2, §9, §11)."""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

from kaptan.risk.gate import COOLDOWN_TR, GateContext, GateLimits, GateOrder, evaluate, evaluate_at_send, r01, r08
from kaptan.risk.security_kill import SECURITY_KILL_THRESHOLD, should_kill

IDS = tuple(f"evt:{i}" for i in range(23))
ORDER = GateOrder(
    ticker="ORNEK",
    event_type="E1",
    qty=1000,
    limit_price=Decimal("48.35"),
    stop_pct=Decimal("0.087"),
    evidence_ids=IDS,
    retrieved_ids=IDS,
    expected_edge_bps=Decimal(70),
    est_cost_bps=Decimal(33),
)
CTX = GateContext(
    equity_try=Decimal(1_016_480),
    last_price=Decimal("47.4"),
    adv20_try=Decimal(20_000_000),
    cash_free_try=Decimal(1_016_480),
    upper_limit=Decimal("52.14"),
)
LIM = GateLimits()


def _check(verdict_results: tuple[object, ...], code: str) -> object:
    return next(r for r in verdict_results if getattr(r, "rule_code", None) == code)


# P8 cooldown -------------------------------------------------------------------------------------------


def test_cooldown_rejects_a_buy_at_r08_with_the_broker_text() -> None:
    v = evaluate(ORDER, replace(CTX, in_cooldown=True))
    assert v.verdict == "reject"
    last = v.results[-1]
    assert (last.rule_code, last.outcome, last.detail_tr) == ("R08", "reject", COOLDOWN_TR)


def test_cooldown_does_not_block_a_sell() -> None:
    sell = replace(ORDER, side="sell")
    assert r08(sell, replace(CTX, in_cooldown=True), LIM, "pre_trade").outcome == "pass"


def test_no_cooldown_passes_r08() -> None:
    assert r08(ORDER, CTX, LIM, "pre_trade").outcome == "pass"


# Crisis: at most one new entry per day -------------------------------------------------------------------


def test_crisis_allows_the_first_entry_of_the_day() -> None:
    v = evaluate(ORDER, replace(CTX, regime="crisis", daily_entries=0))
    assert v.approved
    assert _check(v.results, "R08").outcome == "pass"  # type: ignore[attr-defined]


def test_crisis_rejects_the_second_entry_of_the_day() -> None:
    r = r08(ORDER, replace(CTX, regime="crisis", daily_entries=1), LIM, "pre_trade")
    assert (r.outcome, r.detail_tr) == ("reject", "Kriz rejiminde günlük yeni giriş sınırı (1) dolu.")


def test_normal_regime_keeps_three_entries() -> None:
    assert r08(ORDER, replace(CTX, daily_entries=2), LIM, "pre_trade").outcome == "pass"
    r = r08(ORDER, replace(CTX, daily_entries=3), LIM, "pre_trade")
    assert (r.outcome, r.detail_tr) == ("reject", "Günlük yeni giriş sınırı (3) dolu.")


def test_crisis_entry_cap_is_a_limit_key() -> None:
    lim = replace(LIM, max_daily_entries_crisis=0)
    assert r08(ORDER, replace(CTX, regime="crisis"), lim, "pre_trade").outcome == "reject"


# m_reset after a kill-switch restart ---------------------------------------------------------------------


def test_reset_halves_a_buy_at_r01() -> None:
    r = r01(ORDER, replace(CTX, reset_active=True), LIM, "pre_trade")
    assert (r.outcome, r.new_qty) == ("resize", 500)
    assert r.detail_tr == "Kill switch yeniden başlatması sonrası boyut ×0,5."


def test_reset_resize_flows_through_the_gate_and_escalates() -> None:
    v = evaluate(ORDER, replace(CTX, reset_active=True))
    assert v.verdict == "resize"
    assert v.final_qty <= 500
    assert "RESIZED" in v.escalation_reasons


def test_reset_stacks_with_the_crisis_halving() -> None:
    v = evaluate(ORDER, replace(CTX, reset_active=True, regime="crisis"))
    assert v.final_qty <= 250


def test_reset_does_not_touch_sells_or_the_at_send_recheck() -> None:
    ctx = replace(CTX, reset_active=True, holds_ticker=True)
    assert r01(replace(ORDER, side="sell"), ctx, LIM, "pre_trade").outcome == "pass"
    assert r01(ORDER, ctx, LIM, "at_send").outcome == "pass"
    assert evaluate_at_send(replace(ORDER, qty=500), replace(CTX, reset_active=True)).outcome == "pass"


def test_reset_kill_switch_still_rejects_first() -> None:
    assert r01(ORDER, replace(CTX, reset_active=True, kill_switch_on=True), LIM, "pre_trade").outcome == "reject"


def test_reset_of_one_lot_rejects() -> None:
    v = evaluate(replace(ORDER, qty=1), replace(CTX, reset_active=True))
    assert (v.verdict, v.final_qty) == ("reject", 0)


# Security kill rule (pure) ---------------------------------------------------------------------------------


def test_security_kill_threshold() -> None:
    assert SECURITY_KILL_THRESHOLD == 3
    assert not should_kill(2, kill_on=False)
    assert should_kill(3, kill_on=False)
    assert should_kill(4, kill_on=False)
    assert not should_kill(5, kill_on=True)
