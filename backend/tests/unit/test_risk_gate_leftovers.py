"""M4 package R: P8 cooldown in the gate, crisis ≤ 1 entry/day, no stop rule (06 §7.2, §9)."""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

from kaptan.risk.gate import CHECKS, COOLDOWN_TR, GateContext, GateLimits, GateOrder, evaluate, r08

IDS = tuple(f"evt:{i}" for i in range(23))
ORDER = GateOrder(
    ticker="ORNEK",
    event_type="E1",
    qty=1000,
    limit_price=Decimal("48.35"),
    stop_pct=Decimal("0.087"),
    reader_amount=Decimal(25_000_000),
    regex_amounts=(Decimal(25_000_000),),
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


# No stop rule: a loss never blocks or shrinks an entry ------------------------------------------------------


def test_the_gate_has_no_stop_rule_any_more() -> None:
    from kaptan.domain.schemas.rules import RISK_GATE_ORDER

    assert "R01" not in RISK_GATE_ORDER and "R02" not in RISK_GATE_ORDER
    assert "R01" not in CHECKS and "R02" not in CHECKS
    assert not hasattr(CTX, "kill_switch_on") and not hasattr(CTX, "halted_today")
    assert evaluate(ORDER, CTX).approved
