"""Risk gate R01–R16 (06 §10): order, first reject stops, resizes only shrink, R15 always asks a human."""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

import pytest

from kaptan.demo.fixtures import DemoFixtures
from kaptan.domain.schemas.rules import RISK_GATE_ORDER
from kaptan.risk.gate import GateContext, GateLimits, GateOrder, evaluate, evaluate_at_send

FX = DemoFixtures()
IDS = tuple(f"evt:{i}" for i in range(23))

ORDER = GateOrder(
    ticker="ORNEK",
    event_type="E3",
    qty=1240,
    limit_price=Decimal("48.35"),
    stop_pct=Decimal("0.087"),
    reader_amount=Decimal(432_000_000),
    regex_amounts=(Decimal(432_000_000), Decimal(36_000_000)),
    evidence_ids=IDS,
    retrieved_ids=(*IDS, "evt:extra"),
    expected_edge_bps=Decimal(70),
    est_cost_bps=Decimal(33),
)
CTX = GateContext(
    equity_try=Decimal(1_016_480),
    last_price=Decimal("47.4"),
    adv20_try=Decimal(20_000_000),
    cash_free_try=Decimal(1_016_480),
    upper_limit=Decimal("52.14"),
    drawdown_pct=Decimal("-0.01132"),
    daily_pnl_pct=Decimal("0.0021"),
)


def test_demo_e3_gate_matches_the_fixture_risk_checks() -> None:
    run = next(r for r in FX.runs if r["explain"]["run"]["run_id"] == "run-demo-e3-ornek")
    verdict = evaluate(ORDER, CTX)
    assert verdict.verdict == "pass"
    assert verdict.final_qty == 1240
    assert verdict.level == "normal"
    assert [r.as_document() for r in verdict.results] == run["explain"]["risk_checks"]
    assert [r.rule_code for r in verdict.results] == list(RISK_GATE_ORDER)
    assert verdict.approved


@pytest.mark.parametrize(
    ("ctx_change", "order_change", "code", "outcome"),
    [
        ({"kill_switch_on": True}, {}, "R01", "reject"),
        ({"drawdown_pct": Decimal("-0.05")}, {}, "R01", "reject"),
        ({"daily_pnl_pct": Decimal("-0.011")}, {}, "R02", "reject"),
        ({"halted_today": True}, {}, "R02", "reject"),
        ({"in_universe": False}, {}, "R03", "reject"),
        ({"restrictions": ("vbts_brut_takas",)}, {}, "R04", "reject"),
        ({"restrictions_age_h": 30.0}, {}, "R04", "hold"),
        ({"team_blocklisted": True}, {}, "R13", "reject"),
        ({"quota_ok": False}, {}, "R11", "hold"),
        ({"kap_delay_s": 400.0}, {}, "R11", "hold"),
        ({"injection_flag": True}, {}, "R11", "reject"),
        ({}, {"regex_amounts": (Decimal(1),)}, "R14", "reject"),
        ({}, {"evidence_ids": ("evt:unknown", *IDS)}, "R05", "reject"),
        ({}, {"evidence_ids": IDS[:3]}, "R05", "reject"),
        ({}, {"evidence_before_decision": False}, "R05", "reject"),
        ({}, {"expected_edge_bps": Decimal(60)}, "R06", "reject"),
        ({"price_age_s": 1_500.0}, {}, "R09", "hold"),
        ({"last_price": Decimal(40)}, {}, "R09", "reject"),
        ({"upper_limit": Decimal("48.5")}, {}, "R09", "reject"),
        ({"mode": "live"}, {}, "R12", "reject"),
        ({"holds_ticker": True}, {"side": "sell", "qty": 10}, "R07", "pass"),
        ({}, {"side": "sell"}, "R12", "reject"),
        ({"holds_ticker": True}, {}, "R08", "reject"),
        ({"n_open_positions": 10}, {}, "R08", "reject"),
        ({"daily_entries": 3}, {}, "R08", "reject"),
        ({"sector_exposure_pct": Decimal("0.25")}, {}, "R08", "reject"),
        ({"regime": "crisis"}, {}, "R10", "reject"),
    ],
)
def test_each_rule_can_stop_the_chain(
    ctx_change: dict[str, object], order_change: dict[str, object], code: str, outcome: str
) -> None:
    verdict = evaluate(replace(ORDER, **order_change), replace(CTX, **ctx_change))  # type: ignore[arg-type]
    hit = next(r for r in verdict.results if r.rule_code == code)
    assert hit.outcome == outcome
    if outcome in ("reject", "hold"):
        assert verdict.verdict == outcome
        assert verdict.final_qty == 0
        assert verdict.results[-1].rule_code == code
        assert hit.reason_code == f"{code}_{outcome.upper()}"


def test_resizes_only_shrink_and_escalate_the_card() -> None:
    small_adv = evaluate(ORDER, replace(CTX, adv20_try=Decimal(2_000_000)))
    assert small_adv.verdict == "resize"
    assert small_adv.final_qty == 413  # ⌊1 % × 2 000 000 / 48,35⌋
    assert "RESIZED" in small_adv.escalation_reasons
    assert small_adv.level == "escalate"
    crisis = evaluate(replace(ORDER, event_type="E1"), replace(CTX, regime="crisis"))
    assert crisis.final_qty == 620
    sector = evaluate(ORDER, replace(CTX, sector_exposure_pct=Decimal("0.22")))
    assert sector.final_qty < ORDER.qty
    for v in (small_adv, crisis, sector):
        assert v.final_qty <= ORDER.qty  # monotone


def test_r07_rejects_when_nothing_fits_and_resize_to_zero_rejects() -> None:
    assert evaluate(ORDER, replace(CTX, cash_free_try=Decimal(10))).verdict == "reject"
    tiny = evaluate(replace(ORDER, event_type="E1", qty=1), replace(CTX, regime="crisis"))
    assert tiny.verdict == "reject"


def test_r07_with_no_stop_uses_the_other_caps() -> None:
    assert evaluate(replace(ORDER, stop_pct=Decimal(0)), CTX).verdict == "pass"


def test_r14_skips_e4_and_missing_amount() -> None:
    e4 = evaluate(replace(ORDER, event_type="E4", regex_amounts=()), CTX)
    assert e4.verdict == "pass"
    no_amount = evaluate(replace(ORDER, reader_amount=None, regex_amounts=()), CTX)
    assert no_amount.verdict == "pass"


def test_r15_levels() -> None:
    v = evaluate(replace(ORDER, escalate_required=True, degraded=True), replace(CTX, n_open_positions=8))
    assert v.level == "escalate"
    assert v.escalation_reasons == ("COMPLIANCE_ESCALATE", "DEGRADED", "NEAR_MAX_POSITIONS")
    assert v.results[-1].outcome == "approval_required"
    assert v.results[-1].reason_code == "APPROVAL_REQUIRED"
    esc = evaluate(ORDER, replace(CTX, compliance_decision="escalate"))
    assert esc.escalation_reasons == ("COMPLIANCE_ESCALATE",)


def test_a_compliance_veto_never_reaches_the_gate() -> None:
    with pytest.raises(ValueError, match="veto"):
        evaluate(ORDER, replace(CTX, compliance_decision="veto"))


def test_r16_at_send() -> None:
    ok = evaluate_at_send(ORDER, CTX)
    assert (ok.rule_code, ok.phase, ok.outcome) == ("R16", "at_send", "pass")
    assert ok.detail_tr.startswith("Gönderim anında R01–R04")
    expired = evaluate_at_send(ORDER, replace(CTX, approval_expired=True))
    assert expired.outcome == "reject"
    killed = evaluate_at_send(ORDER, replace(CTX, kill_switch_on=True), GateLimits())
    assert killed.outcome == "reject"
    assert "R01" in killed.detail_tr


@pytest.mark.parametrize(
    ("regime", "event_type", "regime_applied", "outcome", "qty"),
    [
        ("normal", "E3", False, "pass", 1240),  # 06 R10 table #1
        ("crisis", "E3", False, "reject", 0),  # #2
        ("crisis", "E1", False, "resize", 620),  # #3: ×0,5
        ("crisis", "E1", True, "pass", 1240),  # #4: the rule engine already applied m_regime, no double shrink
    ],
)
def test_r10_spec_table(regime: str, event_type: str, regime_applied: bool, outcome: str, qty: int) -> None:
    order = replace(ORDER, event_type=event_type, regime_applied=regime_applied)
    verdict = evaluate(order, replace(CTX, regime=regime))  # type: ignore[arg-type]
    r10 = next(r for r in verdict.results if r.rule_code == "R10")
    assert r10.outcome == outcome
    assert verdict.final_qty == qty
    if regime_applied:
        assert "çift küçültme yok" in r10.detail_tr
