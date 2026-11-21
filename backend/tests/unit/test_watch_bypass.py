"""A watched stock outside the universe is analysed (agent INFO): R03 steps aside, every other rule stays."""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

from kaptan.agents.context import Restriction
from kaptan.agents.nodes.screen import PASS_REASONS, WATCHED_PASS_REASONS, _veto_reasons
from kaptan.risk.gate import GateContext, GateOrder, evaluate
from kaptan.risk.watch import OUTSIDE_LIST_NOTE

IDS = tuple(f"evt:{i}" for i in range(23))
ORDER = GateOrder(
    ticker="INCE",
    event_type="E3",
    qty=5000,
    limit_price=Decimal("10"),
    stop_pct=Decimal("0.05"),
    reader_amount=Decimal(1_000_000),
    regex_amounts=(Decimal(1_000_000),),
    evidence_ids=IDS,
    retrieved_ids=(*IDS, "evt:extra"),
    expected_edge_bps=Decimal(70),
    est_cost_bps=Decimal(33),
)
THIN = GateContext(
    equity_try=Decimal(1_000_000),
    last_price=Decimal(10),
    adv20_try=Decimal(3_000_000),
    cash_free_try=Decimal(1_000_000),
    upper_limit=Decimal("11"),
    in_universe=False,
    watched=True,
)


def test_a_stock_outside_the_universe_is_vetoed_when_not_watched() -> None:
    reasons = _veto_reasons((), False, False)
    assert reasons is not None and reasons[0].startswith("R03_UNIVERSE")


def test_a_watched_stock_outside_the_universe_goes_on_to_the_analysis() -> None:
    assert _veto_reasons((), False, True) is None


def test_the_pre_gate_line_says_the_universe_rule_was_skipped() -> None:
    assert any("izleme listesinde: evren kuralı atlandı" in line for line in WATCHED_PASS_REASONS)
    assert WATCHED_PASS_REASONS != PASS_REASONS


def test_a_restriction_still_vetoes_a_watched_stock() -> None:
    spk = (Restriction("spk_tedbir", "2026/80"),)
    reasons = _veto_reasons(spk, False, True)
    assert reasons is not None and reasons[0].startswith("R04_RESTRICTED")


def test_the_personal_blocklist_still_vetoes_a_watched_stock() -> None:
    reasons = _veto_reasons((Restriction("team_insider", None),), False, True)
    assert reasons is not None and reasons[0].startswith("R13")


def test_the_gate_passes_r03_for_a_watched_stock_and_says_why() -> None:
    verdict = evaluate(ORDER, THIN)
    r03 = next(r for r in verdict.results if r.rule_code == "R03")
    assert r03.outcome == "pass"
    assert "evren kuralı atlandı" in (r03.detail_tr)


def test_the_gate_still_rejects_an_unwatched_stock_outside_the_universe() -> None:
    verdict = evaluate(ORDER, replace(THIN, watched=False))
    assert verdict.verdict == "reject"
    assert next(r for r in verdict.results if r.rule_code == "R03").outcome == "reject"


def test_the_size_of_a_watched_thin_stock_is_capped_by_its_daily_turnover() -> None:
    verdict = evaluate(ORDER, THIN)
    # 1 % of 3.000.000 TL turnover = 30.000 TL = 3.000 shares at 10 TL (the order asked for 5000)
    assert verdict.approved
    assert verdict.final_qty == 3000


def test_without_a_known_turnover_the_gate_refuses_instead_of_guessing() -> None:
    verdict = evaluate(ORDER, replace(THIN, adv20_try=Decimal(0)))
    assert not verdict.approved
    r07 = next(r for r in verdict.results if r.rule_code == "R07")
    assert r07.outcome == "reject"
    assert "bilinmiyor" in (r07.detail_tr)


def test_other_rules_still_apply_to_a_watched_stock() -> None:
    verdict = evaluate(ORDER, replace(THIN, restrictions=("vbts_brut_takas",)))
    assert not verdict.approved
    assert next(r for r in verdict.results if r.rule_code == "R04").outcome == "reject"


def test_the_card_note_names_the_list_and_the_thin_trading() -> None:
    assert "listesinin dışında" in OUTSIDE_LIST_NOTE
    assert "hacmi düşük" in OUTSIDE_LIST_NOTE
