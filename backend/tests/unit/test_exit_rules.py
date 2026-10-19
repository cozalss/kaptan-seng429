"""Exit rules X1–X6 (06 §6) and the exit proposal's documents, pure (M3 A3)."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, date, datetime
from typing import Any

import pytest

from kaptan.demo.fixtures import DemoFixtures
from kaptan.domain.schemas import ApprovalCard
from kaptan.domain.schemas.run import Explain
from kaptan.domain.schemas.trading import TradeProposal
from kaptan.portfolio import exit_docs
from kaptan.portfolio.exit_facts import is_buyback_sale, reversal
from kaptan.portfolio.exit_rules import ExitFacts, break_even_stop, evaluate, hold_sessions

BASE = ExitFacts(
    event_type="E1",
    avg_cost=34.0,
    stop_price=31.0,
    stop_pct=0.088,
    held_sessions=3,
    hold_min=20,
    hold_max=40,
    last_close=34.5,
    max_close=35.0,
    same_type_event=False,
    negative_news=None,
    reversal=None,
)


def test_nothing_fires_on_a_quiet_day() -> None:
    d = evaluate(BASE)
    assert (d.rule, d.new_stop, d.detail) == (None, None, "")


def test_x2_stop_on_the_close() -> None:
    d = evaluate(replace(BASE, last_close=31.0))
    assert d.rule == "X2" and "31.00" in d.detail


def test_x6_break_even_moves_the_stop_and_then_x2_uses_it() -> None:
    up = replace(BASE, max_close=34.0 * (1 + 2 * 0.088))
    assert break_even_stop(up) == 34.0
    assert evaluate(up).new_stop == 34.0
    assert evaluate(replace(up, last_close=33.9)).rule == "X2"  # below the raised stop
    assert break_even_stop(replace(up, stop_price=34.0)) is None  # only moves up
    assert break_even_stop(replace(up, stop_pct=None)) is None


def test_x1_fires_the_session_before_the_nth_and_extends_on_a_new_event() -> None:
    assert evaluate(replace(BASE, held_sessions=19)).rule == "X1"
    assert evaluate(replace(BASE, held_sessions=18)).rule is None
    extended = replace(BASE, held_sessions=19, same_type_event=True)
    assert hold_sessions(extended) == 40 and evaluate(extended).rule is None
    assert hold_sessions(replace(extended, event_type="E3", hold_min=5, hold_max=5)) == 5


def test_priority_x2_then_x3_then_x4_then_x1() -> None:
    all_fire = replace(BASE, last_close=30.0, negative_news="restriction", reversal="sale", held_sessions=25)
    assert evaluate(all_fire).rule == "X2"
    assert evaluate(replace(all_fire, last_close=34.0)).rule == "X3"
    assert evaluate(replace(all_fire, last_close=34.0, negative_news=None)).rule == "X4"
    assert evaluate(replace(all_fire, last_close=34.0, negative_news=None, reversal=None)).rule == "X1"


def test_x4_reversals() -> None:
    sale = {"disclosure_index": 7, "subject": "Geri Alınan Payların Satışı", "summary": "", "parsed": None}
    assert is_buyback_sale(sale)
    assert reversal("E1", [sale], None) == "buyback sale idx 7"
    nature = {"disclosure_index": 8, "subject": "x", "summary": "", "parsed": {"kind": "buyback", "nature": "SATIŞ"}}
    assert is_buyback_sale(nature)
    src = {"rows": [{"buy_nominal_try": 1000}]}
    small = {"parsed": {"kind": "insider_trade", "rows": [{"sell_nominal_try": 400}]}}
    big = {"parsed": {"kind": "insider_trade", "rows": [{"sell_nominal_try": 600}]}}
    assert reversal("E2", [small], src) is None
    assert reversal("E2", [small, big], src) is not None
    assert reversal("E2", [big], None) is None
    assert reversal("E3", [sale], None) is None


def _source() -> dict[str, Any]:
    run: dict[str, Any] = next(r for r in DemoFixtures().runs if r["explain"]["run"]["run_id"] == "run-day-e1-krgcl")
    explain: dict[str, Any] = run["explain"]
    return explain


@pytest.mark.parametrize("rule", ["X1", "X2", "X3", "X4"])
def test_exit_documents_validate_against_the_contract(rule: Any) -> None:
    explain = _source()
    now = datetime(2027, 1, 13, 15, 30, tzinfo=UTC)
    x = exit_docs.ExitInput(
        rule=rule,
        detail="close 30.00 <= stop 31.00",
        day=date(2027, 1, 13),
        now=now,
        expires_at=datetime(2027, 1, 14, 6, 50, tzinfo=UTC),
        source_proposal="prop-day-e1-krgcl",
        source_doc=explain["proposal"],
        source_card=explain["approval"] if rule != "X4" else None,
        source_explain=explain,
        run={
            "ticker": "KRGCL",
            "company_name": "KORU ÇELİK A.Ş.",
            "event_type": "E1",
            "strategy_version": "v1.1-fwd",
            "disclosure_index": 1651207,
        },
        qty=1480,
        ref_price=30.0,
        limit_price=27.0,
        stop_price=31.0 if rule != "X3" else None,
        held_sessions=2,
        level="normal",
        escalation_reasons=[],
        est_cost_bps=10.5,
    )
    run_id, proposal_id = exit_docs.ids(rule, "prop-day-e1-krgcl", date(2027, 1, 13))
    assert run_id == f"run-exit-{rule.lower()}-day-e1-krgcl-20270113"
    proposal = exit_docs.proposal_doc(x, run_id, proposal_id)
    card = exit_docs.card_doc(x, proposal)
    TradeProposal.model_validate(proposal)
    ApprovalCard.model_validate(card)
    Explain.model_validate(exit_docs.explain_doc(x, proposal, card))
    assert (card["side"], card["event_type"], card["entry"]) == (
        "sell",
        "EXIT",
        "intraday_limit" if rule == "X1" else "next_open_auction",
    )
    assert "demo" not in card["headline_tr"].lower()
