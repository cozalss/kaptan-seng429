"""Package A pure logic: Turkish formatting, ticket documents, trace progress, paper orders and fills."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from kaptan.approvals.execute import FillJob, fill_doc, paper_order
from kaptan.approvals.fmt_tr import fmt_dec, fmt_int, fmt_pct, fmt_price
from kaptan.approvals.reads import card_from_row, run_progress
from kaptan.approvals.ticket_doc import (
    EMPTY_ENTRY,
    PAPER_EQUITY_TRY,
    PERSONAL_ACCOUNT_TRY,
    build_ticket,
    effective_entry,
    personal_qty,
    ticket_number,
    ticket_order,
    ticket_valid_until,
)
from kaptan.demo.fixtures import DemoFixtures
from kaptan.runs.explain import progress_trace

DEMO = Path(__file__).resolve().parents[1] / "fixtures" / "demo"
FX = DemoFixtures()


def _expected(name: str) -> Any:
    return json.loads((DEMO / "expected" / name).read_text(encoding="utf-8"))


def _run(run_id: str) -> dict[str, Any]:
    return next(r for r in FX.runs if r["explain"]["run"]["run_id"] == run_id)


@pytest.mark.parametrize(
    ("fn", "value", "out"),
    [
        (fmt_int, 1240, "1.240"),
        (fmt_int, 23, "23"),
        (fmt_int, 1234567.5, "1.234.568"),
        (fmt_int, -3, "-3"),
        (fmt_dec, 2.1, "2,10"),
        (fmt_price, 48.32, "48,32 TL"),
        (fmt_price, 1234.5, "1.234,50 TL"),
    ],
)
def test_number_formats_match_intl_tr(fn: Any, value: float, out: str) -> None:
    assert fn(value) == out


def test_fmt_dec_digits_and_pct() -> None:
    assert fmt_dec(2.125, 1) == "2,1"
    assert fmt_dec(2.15, 1) == "2,2"  # ICU rounds the shortest decimal, not the binary value
    assert fmt_dec(1.005) == "1,01"
    assert fmt_dec(0.05, 1) == "0,1"
    assert fmt_int(-0.4) == "-0"
    assert fmt_pct(0.18) == "%18"
    assert fmt_pct(0.042) == "%4,2"
    assert fmt_pct(-0.011) == "−%1,1"
    assert fmt_pct(-0.00001) == "%0"
    assert fmt_pct(0.0033, 2) == "%0,33"
    assert fmt_pct(0.61, 0) == "%61"


def test_constants_match_the_fixture_meta() -> None:
    assert FX.meta["paper_equity_try"] == PAPER_EQUITY_TRY
    assert FX.meta["personal_account_try"] == PERSONAL_ACCOUNT_TRY


def test_build_ticket_reproduces_every_fixture_ticket() -> None:
    ids = [r["explain"]["run"]["run_id"] for r in FX.runs if r["set"] != "demo"]
    for expected in _expected("tickets.json"):
        run = _run(expected["run_id"])
        card = run["explain"]["approval"]
        built = build_ticket(
            card, run["explain"], seq=10 + ids.index(expected["run_id"]), decided_at=card["decided_at"]
        )
        assert built["entry"] == EMPTY_ENTRY
        assert {**built, "entry": expected["entry"]} == expected


def test_build_ticket_without_proposal_falls_back() -> None:
    run = _run("run-day-e1-tmsmk")
    card = {**run["explain"]["approval"], "rule_trace_summary": [], "approved_notional_try": 1000.0}
    built = build_ticket(card, {"proposal": None, "risk_checks": []}, seq=7, decided_at=card["decided_at"])
    assert built["ticket_no"].endswith("-007")
    assert built["cost_line_tr"] == "Maliyet: Neden ekranında"
    assert built["edge_cost_line_tr"] == "Avantaj / maliyet: Neden ekranında"
    assert built["stop_line_tr"] == "Stop: Neden ekranında"
    assert built["materiality_line_tr"] == "Kural izi: Neden ekranında"
    assert built["amount_check_line_tr"] == "Tutar kontrolü (R14): uygulanmadı"
    assert built["qty"] == personal_qty(card) == 3


def test_ticket_validity_windows() -> None:
    def ist(h: int, m: int, day: int = 11) -> datetime:
        return datetime(2027, 1, day, h, m, tzinfo=UTC) - timedelta(hours=3)

    assert ticket_valid_until(ist(9, 0)) == ist(10, 10)
    assert ticket_valid_until(ist(13, 46)) == ist(14, 16)
    assert ticket_valid_until(ist(17, 50)) == ist(18, 0)
    assert ticket_valid_until(ist(18, 30)) == ist(10, 10, day=12)
    assert ticket_number(ist(1, 0), 3) == "T-2027-0111-003"


def test_effective_entry_and_ticket_order() -> None:
    ticket = {**_expected("tickets.json")[0], "entry": dict(EMPTY_ENTRY)}
    later = datetime(2030, 1, 1, tzinfo=UTC)
    vu = datetime.fromisoformat(ticket["valid_until"].replace("Z", "+00:00"))
    assert effective_entry(vu, None, vu - timedelta(seconds=1))["status"] == "awaiting"
    assert effective_entry(vu, None, later)["status"] == "expired"
    mark = {**EMPTY_ENTRY, "status": "unfilled"}
    assert effective_entry(vu, mark, later) is mark
    awaiting = ticket_order(ticket, None)
    assert awaiting["status"] == "awaiting_manual_entry"
    assert awaiting["created_at"] == ticket["created_at"]
    assert "cancel_reason" not in awaiting
    for status, reason in (("unfilled", "ticket_unfilled"), ("canceled", "ticket_canceled")):
        order = ticket_order({**ticket, "entry": {**EMPTY_ENTRY, "status": status}}, ticket["approved_at"])
        assert (order["status"], order["cancel_reason"]) == ("canceled", reason)
    entry = {**EMPTY_ENTRY, "status": "entered", "filled_qty": 1, "avg_price": 50.0, "filled_at": ticket["created_at"]}
    part = ticket_order({**ticket, "entry": entry}, None)
    assert part["status"] == "partially_filled"
    assert part["fills"][0]["id"] == f"fill-{ticket['ticket_no']}"
    full = ticket_order({**ticket, "entry": {**entry, "filled_qty": ticket["qty"]}}, None)
    assert full["status"] == "filled"


def test_progress_trace_and_run_progress() -> None:
    nodes = [{"node": str(i), "status": "done", "latency_ms": 5, "started_at": "x"} for i in range(4)]
    assert progress_trace(nodes, 1.0) is nodes
    cut = progress_trace(nodes, 0.5)
    assert [n["status"] for n in cut] == ["done", "done", "running", "waiting"]
    assert cut[2]["latency_ms"] is None and cut[2]["started_at"] == "x"
    assert cut[3]["started_at"] is None
    demo_now = datetime(2027, 1, 11, 10, 41, tzinfo=UTC)
    wall = datetime(2026, 10, 17, 12, 0, tzinfo=UTC)
    assert run_progress(None, demo_now, wall) == 1
    assert run_progress(demo_now - timedelta(seconds=3.75), demo_now, wall) == pytest.approx(0.5)
    assert run_progress(wall - timedelta(seconds=30), demo_now, wall) == 1  # a wall-clock injected_at works too
    assert run_progress(demo_now + timedelta(seconds=1), demo_now, wall) == 0


def test_card_effective_status() -> None:
    card = _run("run-day-e1-krgcl")["explain"]["approval"]
    row: dict[str, Any] = {
        "card": card,
        "status": "pending",
        "decided_by": None,
        "decided_role": None,
        "decided_at": None,
        "decision_comment": None,
        "approved_notional_try": None,
        "expires_at": datetime(2027, 1, 12, 6, 50, tzinfo=UTC),
    }
    before = datetime(2027, 1, 11, 11, tzinfo=UTC)
    assert card_from_row(row, kill_on=False, now=before)["status"] == "pending"
    assert card_from_row(row, kill_on=True, now=before)["status"] == "cancelled"
    assert card_from_row(row, kill_on=False, now=datetime(2027, 1, 12, 7, tzinfo=UTC))["status"] == "expired"


def test_paper_order_and_fill() -> None:
    card = _run("run-day-e1-krgcl")["explain"]["approval"]
    now = datetime(2027, 1, 11, 10, 41, tzinfo=UTC)
    auction = paper_order(card, now)
    assert (auction["id"], auction["tif"], auction["status"], auction["qty"]) == (
        "ord-s-day-e1-krgcl",
        "opg",
        "pending_open",
        card["qty"],
    )
    smaller = paper_order({**card, "entry": "intraday_limit", "approved_notional_try": 1000.0}, now)
    assert (smaller["tif"], smaller["status"], smaller["qty"]) == ("day", "accepted", 29)
    fill = fill_doc(FillJob("ord-s-demo-e3-ornek", "run-demo-e3-ornek", "p", "ORNEK", "Ö", 1240, 48.32), now)
    assert fill["id"] == "fill-s-demo-e3-ornek"
    assert fill["commission"] == 29.96
    assert fill["bsmv"] == 1.5
    assert fill["filled_at"] == "2027-01-11T10:41:00.000Z"
