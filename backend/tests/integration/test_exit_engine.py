"""The EOD exit job (M3 A3, 06 §6, FR-29): X2/X1/X3 raise SELL proposals through the normal approval flow,
X6 moves the stop, the approved exit sells at the next open and closes the position, a stop starts the P8
cooldown that GuardedBroker enforces at send. One rolled-back connection per test."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

import pytest

from kaptan.approvals.execute import execute_approved
from kaptan.brokers.fills import run_open_fill
from kaptan.db import DictConn
from kaptan.domain.schemas import iso_ms
from kaptan.portfolio.closing import in_cooldown
from kaptan.portfolio.exits import run_exits
from kaptan.prices.calendar import add_sessions
from tests.contract.harness import assert_matches
from tests.integration.test_fill_engine import (
    KRGCL,
    TUE,
    WED,
    approved_krgcl,
    bar,
    desk,
    last_audit,
    one,
    order,
)

pytestmark = pytest.mark.integration
__all__ = ["desk"]

THU = date(2027, 1, 14)
EXIT_X2 = "prop-exit-x2-day-e1-krgcl-20270113"


async def sign(conn: DictConn, proposal_id: str, now: datetime) -> list[tuple[str, dict[str, Any]]]:
    """The Risk Sorumlusu's approval as service.decide records it, then the execution (the R16 at-send
    check of service.decide belongs to the risk package and is tested there)."""
    await conn.execute(
        "UPDATE trading.approvals SET status = 'approved', decided_by = 'uye-3', decided_role = 'risk_officer', "
        "decided_at = %s WHERE proposal_id = %s",
        (now, proposal_id),
    )
    row = await one(conn, "SELECT card FROM trading.approvals WHERE proposal_id = %s", (proposal_id,))
    assert row is not None
    card = {**row["card"], "status": "approved", "decided_at": iso_ms(now), "approved_notional_try": None}
    events, job = await execute_approved(conn, card, now)
    assert job is None
    return events


async def held_krgcl(conn: DictConn) -> None:
    """KRGCL bought at Tuesday's open: 1480 @ 33.92, stop 30.97."""
    await approved_krgcl(conn)
    await bar(conn, "KRGCL", TUE, open_=33.90, close=34.10)
    assert (await run_open_fill(conn, TUE)).fills


async def test_stop_exit_end_to_end(desk: DictConn) -> None:
    await held_krgcl(desk)
    await bar(desk, "KRGCL", WED, close=30.50)
    report = await run_exits(desk, WED)
    [card] = report.cards
    assert_matches("ApprovalCard", card)
    assert (card["proposal_id"], card["side"], card["event_type"], card["level"]) == (EXIT_X2, "sell", "EXIT", "normal")
    assert (card["qty"], card["limit_price"], card["entry"]) == (
        1480,
        27.46,
        "next_open_auction",
    )  # taban, on the 0.02 tick
    audit = await last_audit(desk)
    assert (audit["action"], audit["payload"]["rule"]) == ("proposal.created", "X2")
    assert (await run_exits(desk, WED)).cards == []  # idempotent / still pending
    # The exit is approved like any proposal (R15) and sells at Thursday's open.
    events = await sign(desk, EXIT_X2, datetime(2027, 1, 13, 16, 0, tzinfo=UTC))
    assert [e for e, _ in events] == ["order"]  # no ticket for a sell
    sell = await order(desk, "ord-s-exit-x2-day-e1-krgcl-20270113")
    assert (sell["side"], sell["status"], sell["qty"]) == ("sell", "pending_open", 1480)
    await bar(desk, "KRGCL", THU, open_=30.00, close=30.20)
    fills = (await run_open_fill(desk, THU)).fills
    assert [f["price"] for f in fills] == [29.98]  # 30.00 less spread + impact (the stop day moved the bars)
    assert await one(desk, "SELECT 1 FROM trading.positions WHERE source_proposal = %s", (KRGCL,)) is None
    closed = await one(desk, "SELECT qty, exit_price, realized_pnl, exit_rule FROM trading.closed_positions")
    assert closed == {"qty": 1480, "exit_price": 29.98, "realized_pnl": -5831.2, "exit_rule": "X2"}
    assert (await last_audit(desk))["payload"]["side"] == "sell"
    # P8: no new entry in KRGCL for 10 sessions; GuardedBroker refuses the buy at send.
    assert await in_cooldown(desk, "KRGCL", add_sessions(THU, 10))
    assert not await in_cooldown(desk, "KRGCL", add_sessions(THU, 11))
    row = await one(desk, "SELECT card FROM trading.approvals WHERE proposal_id = %s", (KRGCL,))
    assert row is not None
    card_again = {**row["card"], "status": "approved", "decided_at": "2027-01-15T07:00:00.000Z"}
    events, _ = await execute_approved(desk, card_again, datetime(2027, 1, 15, 7, 0, tzinfo=UTC))
    assert events[-1][1]["status"] == "rejected"
    audit = await last_audit(desk)
    assert (audit["action"], audit["payload"]["code"]) == ("order.refused", "cooldown")


async def test_break_even_then_time_exit(desk: DictConn) -> None:
    await held_krgcl(desk)
    await bar(desk, "KRGCL", WED, close=40.0)  # ≥ 33.92 × (1 + 2 × 8.69 %)
    report = await run_exits(desk, WED)
    assert (report.cards, report.stops_moved) == ([], [KRGCL])
    pos = await one(desk, "SELECT stop_price FROM trading.positions WHERE source_proposal = %s", (KRGCL,))
    assert pos == {"stop_price": 33.92}
    assert (await last_audit(desk))["action"] == "position.stop_moved"
    day19 = add_sessions(TUE, 18)  # the 19th session held: X1 sells at the 20th session's close
    await bar(desk, "KRGCL", day19, close=36.0)
    [card] = (await run_exits(desk, day19)).cards
    assert (card["sub_type_tr"], card["entry"]) == ("Zaman çıkışı (X1)", "intraday_limit")
    assert_matches("ApprovalCard", card)


async def test_negative_news_exit_and_expired_exit_is_escalated(desk: DictConn) -> None:
    await held_krgcl(desk)
    await desk.execute(
        "INSERT INTO core.restricted_securities (id, ticker, kind, added_at, added_by) "
        "VALUES ('t-x3', 'KRGCL', 'vbts_brut_takas', %s, 'system:tedbir_sync')",
        (datetime(2027, 1, 13, 9, 0, tzinfo=UTC),),
    )
    await bar(desk, "KRGCL", WED, close=34.0)
    [card] = (await run_exits(desk, WED)).cards
    assert card["sub_type_tr"] == "Olumsuz gelişme çıkışı (X3)"
    assert (card["level"], card["escalation_reasons"]) == ("escalate", ["RESTRICTED_SELL"])
    # Nobody signs it before Thursday 09:50: the next evaluation raises it again, escalated (R15).
    await desk.execute("DELETE FROM core.restricted_securities WHERE id = 't-x3'")
    await bar(desk, "KRGCL", THU, close=30.0)
    [again] = (await run_exits(desk, THU)).cards
    assert (again["sub_type_tr"], again["level"], again["escalation_reasons"]) == (
        "Kapanış bazlı stop (X2)",
        "escalate",
        [],
    )


async def test_rejected_exit_is_not_raised_again_and_explain_is_valid(desk: DictConn) -> None:
    await held_krgcl(desk)
    await bar(desk, "KRGCL", WED, close=30.0)
    [card] = (await run_exits(desk, WED)).cards
    explain = await one(desk, "SELECT explain FROM trading.agent_runs WHERE run_id = %s", (card["run_id"],))
    assert explain is not None
    assert_matches("Explain", explain["explain"])
    await desk.execute(
        "UPDATE trading.approvals SET status = 'rejected', decided_by = 'uye-3', decided_at = %s "
        "WHERE proposal_id = %s",
        (datetime(2027, 1, 13, 16, 0, tzinfo=UTC), card["proposal_id"]),
    )
    await bar(desk, "KRGCL", THU, close=29.0)
    report = await run_exits(desk, THU)
    assert (report.cards, report.skipped) == ([], [KRGCL])
