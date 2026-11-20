"""The own book end to end on the new path: a position opened by a real fill gets the exit engine's suggestion,
the exit's sell ticket sells what is held and brings the cash back, the guard refuses a buy that must not go
out and rolls the approval back, and one whole life from the starting money to the cash after the sale.
One rolled-back connection per test (the `desk` fixture)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest

from kaptan.api.errors import ApiError
from kaptan.approvals import service
from kaptan.approvals.execute import execute_approved
from kaptan.approvals.ticket_doc import parse_iso
from kaptan.brokers import config as bc
from kaptan.brokers.config import ExecConfig, TradingConfig
from kaptan.db import DictConn
from kaptan.domain.schemas.money import HoldingInput, MoneyInput
from kaptan.domain.schemas.trading import TicketMarkEntered
from kaptan.portfolio import money
from kaptan.portfolio.closing import in_cooldown
from kaptan.portfolio.exits import run_exits
from kaptan.prices.calendar import add_sessions
from kaptan.risk.book import own_book
from kaptan.risk.pnl_eod import run_pnl_eod
from kaptan.risk.status import risk_status
from tests.contract.harness import assert_matches
from tests.integration.order_support import (
    APPROVE,
    DECIDE_AT,
    KRGCL,
    MON,
    RISK_OFFICER,
    TUE,
    approve,
    bar,
    desk,
    empty_book,
    history,
    one,
    start_money,
)

pytestmark = pytest.mark.integration
__all__ = ["desk"]

START = 1_000_000
EXIT_X2 = "prop-exit-x2-day-e1-krgcl-20270113"
FILL_AT = DECIDE_AT + timedelta(minutes=5)


async def _bought(conn: DictConn, *, price: float | None = None, commission: float = 25.0) -> dict[str, Any]:
    """Starting money, KRGCL approved and entered at the bank: returns the (buy) ticket document."""
    await empty_book(conn)
    await start_money(conn, START, DECIDE_AT - timedelta(days=1))
    await history(conn, "KRGCL", MON)
    ticket = (await approve(conn, KRGCL, DECIDE_AT)).events[1][1]
    entered = TicketMarkEntered(
        mark="entered",
        filled_qty=ticket["qty"],
        avg_price=price or ticket["limit_price"],
        filled_at=FILL_AT,
        commission_try=commission,
    )
    await service.mark_ticket(conn, ticket["ticket_no"], entered, RISK_OFFICER, now=FILL_AT + timedelta(minutes=1))
    return ticket


async def _stop_hit(conn: DictConn) -> dict[str, Any]:
    """Tuesday's close below the stop: the exit engine's X2 card for the position."""
    await bar(conn, "KRGCL", TUE, close=30.50)
    report = await run_exits(conn, TUE)
    [card] = report.cards
    return card


async def test_the_exit_engine_suggests_selling_a_position_a_ticket_fill_opened(desk: DictConn) -> None:
    ticket = await _bought(desk)
    held = await one(desk, "SELECT qty, origin FROM trading.positions WHERE source_proposal = %s", (KRGCL,))
    assert held == {"qty": ticket["qty"], "origin": "suggestion"}
    card = await _stop_hit(desk)
    assert_matches("ApprovalCard", card)
    assert (card["side"], card["event_type"], card["qty"], card["status"]) == ("sell", "EXIT", ticket["qty"], "pending")
    audit = await one(
        desk, "SELECT payload FROM audit.audit_log WHERE action = 'proposal.created' ORDER BY chain_pos DESC"
    )
    assert audit is not None and audit["payload"]["rule"] == "X2"
    assert (await run_exits(desk, TUE)).cards == []  # still pending: not raised twice


async def test_a_share_entered_by_hand_never_gets_an_exit_suggestion(desk: DictConn) -> None:
    await empty_book(desk)
    await start_money(desk, START, DECIDE_AT - timedelta(days=1))
    held = HoldingInput(ticker="KRGCL", qty=100, avg_cost=40.0, bought_on=date(2027, 1, 4))
    await money.add_holding(desk, held, RISK_OFFICER, now=DECIDE_AT)
    await bar(desk, "KRGCL", TUE, close=10.0)  # far below any stop
    assert (await run_exits(desk, TUE)).cards == []


async def test_the_sell_ticket_sells_what_is_held_and_brings_the_cash_back(desk: DictConn) -> None:
    bought = await _bought(desk)
    qty = bought["qty"]
    cash_held = (await own_book(desk, FILL_AT + timedelta(hours=1))).cash
    card = await _stop_hit(desk)
    decided_at = datetime.fromisoformat(card["created_at"].replace("Z", "+00:00")) + timedelta(minutes=1)
    outcome = await service.decide(desk, card["proposal_id"], APPROVE, RISK_OFFICER, now=decided_at)
    assert [e for e, _ in outcome.events] == ["approval.decided", "ticket"]
    sell = outcome.events[1][1]
    assert_matches("OrderTicket", sell)
    assert (sell["side"], sell["qty"], sell["ticker"]) == ("sell", qty, "KRGCL")  # exactly what the book holds
    floor = sell["limit_price"]
    now = parse_iso(sell["valid_until"]) - timedelta(minutes=10)

    def entered(q: int, price: float, **kw: Any) -> TicketMarkEntered:
        return TicketMarkEntered(mark="entered", filled_qty=q, avg_price=price, filled_at=now, **kw)

    with pytest.raises(ApiError) as under:
        await service.mark_ticket(desk, sell["ticket_no"], entered(qty, floor - 0.5), RISK_OFFICER, now=now)
    assert (under.value.status, under.value.code) == (422, "under_limit")
    with pytest.raises(ApiError) as over:
        await service.mark_ticket(desk, sell["ticket_no"], entered(qty + 1, floor + 1), RISK_OFFICER, now=now)
    assert (over.value.status, over.value.code) == (422, "over_qty")

    price = round(floor + 1.0, 2)
    done = await service.mark_ticket(
        desk, sell["ticket_no"], entered(qty, price, commission_try=30.0), RISK_OFFICER, now=now
    )
    assert done.body["entry"]["status"] == "entered" and done.body["entry"]["commission_try"] == 30.0
    book = await own_book(desk, now + timedelta(minutes=1))
    assert book.holdings == () and book.reserved == 0
    assert book.cash == cash_held + (Decimal(str(price)) * qty - Decimal(30)).quantize(Decimal("0.01"))
    assert await one(desk, "SELECT 1 FROM trading.positions WHERE source_proposal = %s", (KRGCL,)) is None
    closed = await one(desk, "SELECT qty, exit_price, exit_rule FROM trading.closed_positions")
    assert closed == {"qty": qty, "exit_price": price, "exit_rule": "X2"}
    audit = await one(
        desk, "SELECT payload FROM audit.audit_log WHERE action = 'ticket.entered' ORDER BY chain_pos DESC"
    )
    assert audit is not None and audit["payload"]["side"] == "sell"


async def _refused(conn: DictConn, code: str) -> None:
    """Approving KRGCL is refused with 409 `code`, the card stays pending and no ticket was written."""
    with pytest.raises(ApiError) as err:
        await approve(conn, KRGCL, DECIDE_AT)
    assert (err.value.status, err.value.code) == (409, code)
    card = await one(conn, "SELECT status FROM trading.approvals WHERE proposal_id = %s", (KRGCL,))
    assert card == {"status": "pending"}
    assert await one(conn, "SELECT 1 FROM trading.order_tickets WHERE proposal_id = %s", (KRGCL,)) is None
    assert await one(conn, "SELECT 1 FROM trading.book_ledger WHERE kind = 'buy'") is None


async def _ready(conn: DictConn) -> None:
    await empty_book(conn)
    await start_money(conn, START, DECIDE_AT - timedelta(days=1))
    await history(conn, "KRGCL", MON)


async def test_the_guard_refuses_a_buy_under_the_kill_switch(desk: DictConn) -> None:
    await _ready(desk)
    await desk.execute("UPDATE trading.risk_state SET kill_switch = 'on'")
    await _refused(desk, "kill_switch")


async def test_the_guard_refuses_a_buy_after_the_day_halt(desk: DictConn) -> None:
    await _ready(desk)
    await desk.execute("UPDATE trading.risk_state SET halted_today = true")
    await _refused(desk, "halted")


async def test_the_guard_refuses_a_buy_inside_the_cooldown_a_stop_sale_starts(desk: DictConn) -> None:
    await _bought(desk)
    card = await _stop_hit(desk)
    decided_at = datetime.fromisoformat(card["created_at"].replace("Z", "+00:00")) + timedelta(minutes=1)
    sell = (await service.decide(desk, card["proposal_id"], APPROVE, RISK_OFFICER, now=decided_at)).events[1][1]
    sold_at = parse_iso(sell["valid_until"]) - timedelta(minutes=10)
    sale = TicketMarkEntered(
        mark="entered", filled_qty=sell["qty"], avg_price=sell["limit_price"] + 1, filled_at=sold_at
    )
    await service.mark_ticket(desk, sell["ticket_no"], sale, RISK_OFFICER, now=sold_at)
    assert await in_cooldown(desk, "KRGCL", add_sessions(TUE, 5))  # P8: ten sessions without a new entry
    row = await one(desk, "SELECT card FROM trading.approvals WHERE proposal_id = %s", (KRGCL,))
    assert row is not None
    again = {**row["card"], "status": "approved"}
    with pytest.raises(ApiError) as err:
        await execute_approved(desk, again, sold_at + timedelta(days=1))
    assert (err.value.status, err.value.code) == (409, "cooldown")


async def test_the_guard_refuses_a_buy_above_the_hard_cap(desk: DictConn) -> None:
    await _ready(desk)
    bc.install(ExecConfig(trading=TradingConfig(hard_cap_try=Decimal(1000))))
    await _refused(desk, "hard_cap")


async def test_a_sell_exit_is_still_approved_under_the_kill_switch(desk: DictConn) -> None:
    await _bought(desk)
    card = await _stop_hit(desk)
    await desk.execute("UPDATE trading.risk_state SET kill_switch = 'on'")
    decided_at = datetime.fromisoformat(card["created_at"].replace("Z", "+00:00")) + timedelta(minutes=1)
    outcome = await service.decide(desk, card["proposal_id"], APPROVE, RISK_OFFICER, now=decided_at)
    assert outcome.events[1][1]["side"] == "sell"  # a stop never blocks leaving a position


async def test_the_whole_life_from_the_starting_money_to_the_cash_after_the_sale(desk: DictConn) -> None:
    await empty_book(desk)
    await start_money(desk, START, DECIDE_AT - timedelta(days=1))
    await history(desk, "KRGCL", MON)
    ticket = (await approve(desk, KRGCL, DECIDE_AT)).events[1][1]
    qty, price = ticket["qty"], ticket["limit_price"]
    entered = TicketMarkEntered(mark="entered", filled_qty=qty, avg_price=price, filled_at=FILL_AT, commission_try=40.0)
    await service.mark_ticket(desk, ticket["ticket_no"], entered, RISK_OFFICER, now=FILL_AT)
    cost = (Decimal(str(price)) * qty).quantize(Decimal("0.01")) + Decimal(40)
    assert (await own_book(desk, FILL_AT)).cash == Decimal(START) - cost

    # a deposit after the fill, then the day closes: the close is the day's level the next day is measured from
    dep_at = FILL_AT + timedelta(hours=1)
    await money.add_money(desk, MoneyInput(kind="deposit", amount_try=500_000), RISK_OFFICER, now=dep_at)
    await bar(desk, "KRGCL", MON, close=price)
    await run_pnl_eod(desk, MON)
    close_equity = (await own_book(desk, dep_at + timedelta(hours=6))).equity

    # Tuesday the price falls below the stop: the day's P&L is the fall only, the deposit is not counted as a gain
    await bar(desk, "KRGCL", TUE, close=30.50)
    tue_noon = datetime(2027, 1, 12, 9, 0, tzinfo=DECIDE_AT.tzinfo)
    status = await risk_status(desk, tue_noon + timedelta(hours=9))
    loss = (30.50 - price) * qty
    assert status["equity"] == pytest.approx(float(close_equity) + loss, abs=1)
    assert status["daily_pnl_pct"] == pytest.approx(loss / float(close_equity), abs=1e-4)
    assert status["daily_pnl_pct"] < 0 and status["drawdown_pct"] < 0

    [card] = (await run_exits(desk, TUE)).cards
    assert card["side"] == "sell"
    decided_at = datetime.fromisoformat(card["created_at"].replace("Z", "+00:00")) + timedelta(minutes=1)
    sell = (await service.decide(desk, card["proposal_id"], APPROVE, RISK_OFFICER, now=decided_at)).events[1][1]
    sold_at = parse_iso(sell["valid_until"]) - timedelta(minutes=10)
    sale_price = round(sell["limit_price"] + 0.5, 2)
    sale = TicketMarkEntered(
        mark="entered", filled_qty=qty, avg_price=sale_price, filled_at=sold_at, commission_try=35.0
    )
    await service.mark_ticket(desk, sell["ticket_no"], sale, RISK_OFFICER, now=sold_at)
    final = await own_book(desk, sold_at + timedelta(minutes=1))
    proceeds = (Decimal(str(sale_price)) * qty - Decimal(35)).quantize(Decimal("0.01"))
    assert final.holdings == ()
    assert final.cash == Decimal(START) + Decimal(500_000) - cost + proceeds
    assert final.put_in == Decimal(START) + Decimal(500_000)  # the money put in is only what the person put in
