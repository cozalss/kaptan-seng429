"""SELL tickets (M4 S, 06 §6 / R12, 12 §2): an approved exit of a position your personal book holds prints a
SELL emir fişi for exactly the held lots (no short selling); its mark is checked against the limit as a floor
and an entered sell closes the personal position. One rolled-back connection per test."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from kaptan.api.errors import ApiError
from kaptan.approvals import service
from kaptan.approvals.ticket_doc import parse_iso, ticket_order
from kaptan.db import DictConn
from kaptan.domain.schemas.trading import TicketMarkEntered
from kaptan.portfolio.exits import run_exits
from tests.contract.harness import assert_matches
from tests.integration.test_exit_engine import EXIT_X2, held_krgcl, sign
from tests.integration.test_fill_engine import KRGCL, RISK_OFFICER, WED, bar, desk, last_audit, one

pytestmark = pytest.mark.integration
__all__ = ["desk"]

PERSONAL_LOTS = 300


def _entered(ticket: dict[str, Any], qty: int, price: float) -> TicketMarkEntered:
    at = parse_iso(ticket["valid_until"]) - timedelta(minutes=5)
    return TicketMarkEntered(mark="entered", filled_qty=qty, avg_price=price, filled_at=at)


async def _held_in_both_books(conn: DictConn) -> None:
    """KRGCL in the paper book (1480) and, through its buy ticket marked entered, the personal book (300)."""
    await held_krgcl(conn)
    row = await one(
        conn, "SELECT ticket_no, doc, valid_until FROM trading.order_tickets WHERE proposal_id = %s", (KRGCL,)
    )
    assert row is not None
    buy = {**row["doc"], "valid_until": row["doc"]["valid_until"]}
    assert buy["side"] == "buy"
    await service.mark_ticket(
        conn, row["ticket_no"], _entered(buy, PERSONAL_LOTS, 33.90), RISK_OFFICER, now=parse_iso(buy["valid_until"])
    )
    pos = await one(
        conn, "SELECT qty FROM trading.positions WHERE book = 'personal' AND source_proposal = %s", (KRGCL,)
    )
    assert pos == {"qty": PERSONAL_LOTS}


async def _sell_ticket(conn: DictConn) -> dict[str, Any]:
    await _held_in_both_books(conn)
    await bar(conn, "KRGCL", WED, close=30.50)
    assert [c["side"] for c in (await run_exits(conn, WED)).cards] == ["sell"]
    events = await sign(conn, EXIT_X2, datetime(2027, 1, 13, 16, 0, tzinfo=UTC))
    assert [e for e, _ in events] == ["ticket", "order"]
    ticket = events[0][1]
    assert_matches("OrderTicket", ticket)
    return ticket


async def test_an_exit_of_a_personal_holding_prints_a_sell_ticket_for_the_held_lots(desk: DictConn) -> None:
    ticket = await _sell_ticket(desk)
    assert (ticket["side"], ticket["qty"], ticket["limit_price"]) == ("sell", PERSONAL_LOTS, 27.46)
    assert ticket["entry"]["status"] == "awaiting"
    audit = await last_audit(desk)
    assert audit["action"] != "ticket.issued" or audit["payload"]["side"] == "sell"
    issued = await one(
        desk, "SELECT payload FROM audit.audit_log WHERE action = 'ticket.issued' ORDER BY chain_pos DESC LIMIT 1"
    )
    assert issued is not None and issued["payload"]["side"] == "sell"
    derived = ticket_order(ticket, ticket["approved_at"])
    assert_matches("Order", derived)
    assert (derived["side"], derived["broker"]) == ("sell", "order_ticket")
    paper = await one(desk, "SELECT side, qty FROM trading.orders WHERE id = 'ord-s-exit-x2-day-e1-krgcl-20270113'")
    assert paper == {"side": "sell", "qty": 1480}


async def test_sell_ticket_mark_rules_and_entered_sell_closes_the_personal_position(desk: DictConn) -> None:
    ticket = await _sell_ticket(desk)
    now = parse_iso(ticket["valid_until"])
    with pytest.raises(ApiError) as under:
        await service.mark_ticket(desk, ticket["ticket_no"], _entered(ticket, 100, 27.40), RISK_OFFICER, now=now)
    assert (under.value.status, under.value.code) == (422, "under_limit")
    with pytest.raises(ApiError) as short:
        await service.mark_ticket(
            desk, ticket["ticket_no"], _entered(ticket, PERSONAL_LOTS + 1, 28.0), RISK_OFFICER, now=now
        )
    assert (short.value.status, short.value.code) == (422, "over_qty")
    outcome = await service.mark_ticket(
        desk, ticket["ticket_no"], _entered(ticket, PERSONAL_LOTS, 28.10), RISK_OFFICER, now=now
    )
    assert outcome.body["entry"]["status"] == "entered"
    assert_matches("OrderTicket", outcome.body)
    audit = await last_audit(desk)
    assert (audit["action"], audit["payload"]["side"]) == ("ticket.entered", "sell")
    gone = await one(desk, "SELECT 1 FROM trading.positions WHERE book = 'personal' AND source_proposal = %s", (KRGCL,))
    assert gone is None
    closed = await one(desk, "SELECT qty, exit_price FROM trading.closed_positions WHERE book = 'personal'")
    assert closed == {"qty": PERSONAL_LOTS, "exit_price": 28.1}
    paper = await one(desk, "SELECT qty FROM trading.positions WHERE book = 'paper' AND source_proposal = %s", (KRGCL,))
    assert paper == {"qty": 1480}  # the paper book sells through SimBIST, not the ticket
