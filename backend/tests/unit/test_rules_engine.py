"""Rule engine E1–E4 (06 §3–§8): pure decisions, trace rows, sizing, calendar, formatting."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from kaptan.demo.fixtures import DemoFixtures
from kaptan.rules import DEFAULT_PARAMS, RuleInput, SizingInput, decide, size
from kaptan.rules.calendar import approval_expiry, is_trading_day, next_trading_day
from kaptan.rules.engine import trace_row
from kaptan.rules.format import fmt_dec, fmt_int, fmt_pct, fmt_ratio_x, fmt_signed_pct, fmt_try
from kaptan.rules.params import rules_hash_of
from kaptan.rules.sizing import limit_price_of

FX = DemoFixtures()

E3_DEMO = RuleInput(
    event_type="E3",
    ticker="ORNEK",
    agent_status=(("classifier", "ok"), ("evidence", "ok"), ("materiality", "ok"), ("reader", "ok")),
    classifier_confidence=0.93,
    reader_confidence=0.92,
    materiality_confidence=0.88,
    skeptic_confidence=0.77,
    materiality_ratio=0.18,
    materiality_denominator="annual_revenue",
    binding_status="signed_contract",
    related_party=False,
    renewal=False,
    reader_amount_try=432_000_000,
    amount_in_text=True,
    leakage_5d=0.041,
    expected_edge_bps=70,
    est_cost_bps=33,
    evidence_n=23,
    evidence_card_id="card-demo-e3-ornek",
)


def _demo_trace() -> list[dict[str, object]]:
    run = next(r for r in FX.runs if r["explain"]["run"]["run_id"] == "run-demo-e3-ornek")
    trace: list[dict[str, object]] = run["explain"]["approval"]["rule_trace_summary"]
    return trace


# ── formatting (lib/format.ts) ────────────────────────────────────────────
@pytest.mark.parametrize(
    ("ratio", "digits", "expected"),
    [
        (0.18, 1, "%18"),
        (0.0031, 2, "%0,31"),
        (-0.01132, 1, "−%1,1"),
        (-0.00001, 1, "%0"),
        (0.05898, 1, "%5,9"),
        (12.5, 0, "%1.250"),
    ],
)
def test_fmt_pct(ratio: float, digits: int, expected: str) -> None:
    assert fmt_pct(ratio, digits) == expected


def test_other_formats() -> None:
    assert fmt_signed_pct(0.041) == "+%4,1"
    assert fmt_signed_pct(-0.03) == "−%3"
    assert fmt_int(1240) == "1.240"
    assert fmt_try(432_000_000) == "432.000.000 TL"
    assert fmt_dec(2.0) == "2,00"
    assert fmt_ratio_x(70 / 33) == "2,1×"
    assert fmt_dec(-1.25, 1) == "-1,3"


# ── the demo E3 run ────────────────────────────────────────────────────────
def test_e3_demo_reproduces_the_fixture_rule_trace() -> None:
    result = decide(E3_DEMO)
    assert result.outcome == "PROPOSE"
    assert result.reason_codes == ("E3_RULE_MET",)
    assert [trace_row(c) for c in result.trace] == _demo_trace()
    assert result.rules_hash == FX.meta["rules_hash"]
    doc = result.as_document()
    assert doc["rules_fired"] == [c.rule for c in result.trace]


def test_rules_hash_is_the_preregistered_seed() -> None:
    assert rules_hash_of() == DEFAULT_PARAMS.rules_hash == "0f4f8a28ee520c6f"


# ── HOLD paths (05 §5.1, first match wins) ─────────────────────────────────
@pytest.mark.parametrize(
    ("change", "code", "rule"),
    [
        ({"agent_status": (("reader", "failed"),)}, "HOLD_AGENT_FAILED", "HOLD.agent_failed"),
        ({"agent_status": (("evidence", "abstain"),)}, "HOLD_AGENT_ABSTAIN", "HOLD.agent_abstain"),
        ({"classifier_confidence": 0.71}, "HOLD_LOW_CONFIDENCE", "HOLD.low_confidence"),
        ({"reader_confidence": 0.5}, "HOLD_LOW_CONFIDENCE", "HOLD.low_confidence"),
        ({"materiality_confidence": 0.5}, "HOLD_LOW_CONFIDENCE", "HOLD.low_confidence"),
        ({"skeptic_veto": True, "skeptic_veto_supported": False}, "HOLD_UNSUPPORTED_VETO", "HOLD.unsupported_veto"),
        ({"skeptic_veto": True, "skeptic_confidence": 0.4}, "HOLD_UNSUPPORTED_VETO", "HOLD.unsupported_veto"),
    ],
)
def test_hold_paths(change: dict[str, object], code: str, rule: str) -> None:
    result = decide(replace(E3_DEMO, **change))  # type: ignore[arg-type]
    assert result.outcome == "HOLD"
    assert result.reason_codes == (code,)
    assert result.trace[0].rule == rule
    assert result.trace[0].passed is False


def test_low_confidence_trace_matches_the_hold_fixture() -> None:
    result = decide(replace(E3_DEMO, classifier_confidence=0.71))
    assert trace_row(result.trace[0]) == {
        "rule": "HOLD.low_confidence",
        "passed": False,
        "observed": "0,71",
        "threshold": "≥ 0,80",
        "detail_tr": "Sınıflandırıcı güveni eşik altında: HOLD.",
    }


# ── NO_TRADE paths ─────────────────────────────────────────────────────────
def test_supported_skeptic_veto_blocks_but_keeps_the_trace() -> None:
    result = decide(replace(E3_DEMO, skeptic_veto=True, binding_status="mou_or_loi"))
    assert result.outcome == "NO_TRADE"
    assert result.reason_codes == ("SKEPTIC_VETO", "E3_RULE_NOT_MET")
    assert [c.rule for c in result.trace] == ["E3.materiality", "E3.binding"]
    assert result.trace[1].observed == "niyet mektubu"


def test_avoid_list_and_injection_review() -> None:
    avoid = decide(replace(E3_DEMO, avoid_listed=True))
    assert avoid.outcome == "NO_TRADE"
    assert "AVOID_LIST" in avoid.reason_codes
    flagged = decide(replace(E3_DEMO, any_injection_flag=True))
    assert flagged.outcome == "PROPOSE"
    assert flagged.escalate is True
    assert flagged.reason_codes == ("INJECTION_REVIEW", "E3_RULE_MET")


def test_not_an_event() -> None:
    result = decide(replace(E3_DEMO, event_type="IGNORE"))
    assert result.outcome == "NO_TRADE"
    assert result.trace[0].rule == "AVOID.not_event"


@pytest.mark.parametrize(
    ("change", "failing_rule", "observed"),
    [
        ({"materiality_ratio": 0.04}, "E3.materiality", "%4"),
        ({"related_party": True}, "E3.not_related_party", "ilişkili taraf"),
        ({"renewal": True}, "E3.not_renewal", "yenileme"),
        ({"amount_in_text": False}, "E3.amount_in_text", "432.000.000 TL"),
    ],
)
def test_e3_rules_stop_at_the_first_failure(change: dict[str, object], failing_rule: str, observed: str) -> None:
    result = decide(replace(E3_DEMO, **change))  # type: ignore[arg-type]
    assert result.outcome == "NO_TRADE"
    assert result.reason_codes == ("E3_RULE_NOT_MET",)
    assert result.trace[-1].rule == failing_rule
    assert result.trace[-1].observed == observed


def test_e3_market_cap_fallback() -> None:
    ok = decide(replace(E3_DEMO, materiality_ratio=0.06, materiality_denominator="market_cap"))
    assert ok.trace[0].threshold == "≥ %5 piyasa değeri"
    assert ok.trace[0].detail_tr == "Tutar piyasa değerinin %6'i."
    assert ok.outcome == "PROPOSE"


def test_leakage_skips_e3_and_halves_e2() -> None:
    skip = decide(replace(E3_DEMO, leakage_5d=0.092))
    assert skip.outcome == "NO_TRADE"
    assert skip.reason_codes == ("LEAKAGE_SKIP",)
    assert skip.trace[-1].observed == "+%9,2"
    e2 = replace(
        E3_DEMO,
        event_type="E2",
        insider_role="board_member",
        insider_open_market=True,
        insider_net_buy_value_try=2_400_000,
        leakage_5d=0.09,
    )
    half = decide(e2)
    assert half.outcome == "PROPOSE"
    assert half.leakage_multiplier == Decimal("0.5")
    assert half.reason_codes == ("LEAKAGE_HALF", "E2_RULE_MET")


def test_edge_and_evidence_floors() -> None:
    edge = decide(replace(E3_DEMO, expected_edge_bps=50))
    assert edge.outcome == "NO_TRADE"
    assert edge.reason_codes == ("EDGE_BELOW_COST",)
    no_cost = decide(replace(E3_DEMO, est_cost_bps=0))
    assert no_cost.reason_codes == ("EDGE_BELOW_COST",)
    thin = decide(replace(E3_DEMO, evidence_n=3))
    assert thin.outcome == "NO_TRADE"
    assert thin.reason_codes == ("NO_EVIDENCE",)
    assert thin.trace[-1].detail_tr == "Benzer olay sayısı yetersiz."


# ── E1 / E2 / E4 ───────────────────────────────────────────────────────────
E1 = replace(E3_DEMO, event_type="E1", e1_nature="execution", buyback_10d_capital_pct=0.0031)


def test_e1_paths() -> None:
    ok = decide(E1)
    assert ok.outcome == "PROPOSE"
    assert ok.trace[0].observed == "%0,31"
    assert [c.rule for c in ok.trace[:3]] == ["E1.capital_10d", "E1.execution", "E1.no_recent_sale"]
    clustered = decide(replace(E1, buyback_10d_capital_pct=0.0012, buyback_10d_notice_count=3))
    assert clustered.outcome == "PROPOSE"
    low = decide(replace(E1, buyback_10d_capital_pct=0.001))
    assert low.reason_codes == ("E1_RULE_NOT_MET",)
    announce = decide(replace(E1, e1_nature="program_announcement"))
    assert announce.trace[-1].observed == "program duyurusu"
    sold = decide(replace(E1, buyback_sale_within_20d=True))
    assert sold.trace[-1].rule == "E1.no_recent_sale"
    assert sold.outcome == "NO_TRADE"


E2 = replace(
    E3_DEMO, event_type="E2", insider_role="board_member", insider_open_market=True, insider_net_buy_value_try=2.4e6
)


def test_e2_paths() -> None:
    ok = decide(E2)
    assert ok.outcome == "PROPOSE"
    assert ok.trace[1].detail_tr == "Alıcı yönetim kurulu üyesi."
    exec_ok = decide(replace(E2, insider_role="executive"))
    assert exec_ok.trace[1].detail_tr == "Alıcı yönetici."
    off_market = decide(replace(E2, insider_open_market=False))
    assert off_market.trace[-1].observed == "borsa dışı"
    fund = decide(replace(E2, insider_role="investment_fund"))
    assert fund.trace[-1].detail_tr == "Fonların eşik bildirimleri E2 değildir."
    other = decide(replace(E2, insider_role="unknown"))
    assert other.trace[-1].detail_tr == "Alıcı yönetici, YK üyesi veya ana ortak değil."
    small = decide(replace(E2, insider_net_buy_value_try=500_000))
    assert small.trace[-1].rule == "E2.min_value"
    assert small.outcome == "NO_TRADE"


E4 = replace(E3_DEMO, event_type="E4", e4_sue=1.4, e4_cfo_quality="iyi", ret_10d=0.05)


def test_e4_paths() -> None:
    ok = decide(E4)
    assert ok.outcome == "PROPOSE"
    assert ok.trace[0].observed == "1,4"
    assert ok.trace[2].observed == "+%5"
    assert decide(replace(E4, e4_sue=0.5)).trace[-1].rule == "E4.sue"
    assert decide(replace(E4, e4_cfo_quality=0.9)).outcome == "PROPOSE"
    weak_cfo = decide(replace(E4, e4_cfo_quality=0.5))
    assert weak_cfo.trace[-1].rule == "E4.cfo_quality"
    assert decide(replace(E4, e4_cfo_quality=None)).outcome == "NO_TRADE"
    assert decide(replace(E4, ret_10d=0.15)).trace[-1].rule == "E4.ret10d"


# ── sizing (06 §5, §7) ─────────────────────────────────────────────────────
def test_sizing_reproduces_the_demo_proposal() -> None:
    s = size(
        SizingInput(
            ref_price=Decimal("47.4"),
            stop_pct=Decimal("0.087"),
            requested_notional_try=Decimal(119_908),
            upper_limit=Decimal("52.14"),
            skeptic_multiplier=Decimal("0.5"),
        )
    )
    assert (s.limit_price, s.stop_price, s.qty) == (Decimal("48.35"), Decimal("43.28"), 1240)
    assert s.final_notional_try == Decimal("59954.00")
    assert not s.is_empty


def test_sizing_guards() -> None:
    assert limit_price_of(Decimal(100), Decimal("101.00")) == Decimal("100.99")
    zero = size(SizingInput(Decimal(100), Decimal("0.05"), Decimal(50), skeptic_multiplier=Decimal(0)))
    assert zero.is_empty
    with pytest.raises(ValueError, match="positive"):
        size(SizingInput(Decimal(0), Decimal("0.05"), Decimal(100)))
    with pytest.raises(ValueError, match="multipliers"):
        size(SizingInput(Decimal(10), Decimal("0.05"), Decimal(100), skeptic_multiplier=Decimal("1.5")))


# ── calendar (R15) ─────────────────────────────────────────────────────────
def test_approval_expiry_is_the_next_session_0950() -> None:
    assert approval_expiry(datetime(2027, 1, 11, 10, 41, 48, tzinfo=UTC)) == datetime(2027, 1, 12, 6, 50, tzinfo=UTC)
    # Friday evening → Monday; 31 Dec → skips the 1 Jan holiday and the weekend
    assert approval_expiry(datetime(2027, 1, 8, 16, 0, tzinfo=UTC)).date() == date(2027, 1, 11)
    assert next_trading_day(date(2026, 12, 31)) == date(2027, 1, 4)
    assert not is_trading_day(date(2026, 10, 29))
