"""Fixing the book: correct the starting money, undo or correct a movement, fix a recorded fill, start over, the
person's own broker commission rate. Every fix is a new ledger row that points at the original; none is a gain or a
loss; every one is audited. Everything runs on one rolled-back connection."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest

from kaptan.api.errors import ApiError
from kaptan.approvals import service
from kaptan.db import DictConn
from kaptan.domain.schemas.money import HoldingInput, HoldingSellInput, MoneyInput, MovementCorrectInput
from kaptan.domain.schemas.trading import TicketCorrectInput, TicketMarkEntered
from kaptan.portfolio import export, fee, fresh_start, money
from kaptan.portfolio.overview import me_overview
from kaptan.portfolio.positions import list_positions
from kaptan.risk.book import own_book
from kaptan.risk.status import risk_status
from tests.integration.order_support import DECIDE_AT, KRGCL, RISK_OFFICER, approve, desk, empty_book, history, one

pytestmark = pytest.mark.integration
__all__ = ["desk"]

NOW = DECIDE_AT


async def _start(conn: DictConn, amount: int = 100_000) -> dict[str, Any]:
    outcome = await money.add_money(
        conn, MoneyInput(kind="start", amount_try=amount), RISK_OFFICER, now=NOW - timedelta(days=1)
    )
    assert outcome.body is not None
    return outcome.body


async def _audit(conn: DictConn) -> dict[str, Any]:
    row = await one(conn, "SELECT action, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1")
    assert row is not None
    return row


def _id(book: dict[str, Any], kind: str) -> str:
    return str(next(m["id"] for m in book["movements"] if m["kind"] == kind))


async def test_the_starting_money_can_be_corrected_up_and_down_and_it_is_not_a_gain(desk: DictConn) -> None:
    await empty_book(desk)
    book = await _start(desk, 100_000)
    start = _id(book, "start")
    fixed = await money.correct_movement(desk, start, MovementCorrectInput(amount_try=150_000), RISK_OFFICER, now=NOW)
    assert (fixed["cash"], fixed["put_in"]) == (150_000, 150_000)
    row = fixed["movements"][0]
    assert (row["status"], row["amount_try"], row["original_amount_try"]) == ("corrected", 150_000, 100_000)
    assert await _audit(desk) == {
        "action": "money.corrected",
        "payload": {"kind": "start", "old_amount_try": 100_000.0, "new_amount_try": 150_000.0},
    }
    status = await risk_status(desk, NOW)
    assert status["equity"] == 150_000 and status["daily_pnl_pct"] == 0 and status["drawdown_pct"] == 0
    down = await money.correct_movement(desk, start, MovementCorrectInput(amount_try=40_000), RISK_OFFICER, now=NOW)
    assert (down["cash"], down["put_in"]) == (40_000, 40_000)
    assert down["movements"][0]["original_amount_try"] == 100_000
    status = await risk_status(desk, NOW)
    assert status["equity"] == 40_000 and status["daily_pnl_pct"] == 0 and status["drawdown_pct"] == 0
    rows = await one(desk, "SELECT count(*) AS n FROM trading.book_ledger WHERE kind = 'correction'")
    assert rows == {"n": 2}  # history is kept: two correction rows, the start row itself never changed
    with pytest.raises(ApiError) as same:
        await money.correct_movement(desk, start, MovementCorrectInput(amount_try=40_000), RISK_OFFICER, now=NOW)
    assert same.value.code == "no_change"


async def test_a_correction_may_not_push_free_cash_below_zero(desk: DictConn) -> None:
    await empty_book(desk)
    book = await _start(desk, 100_000)
    await money.add_money(desk, MoneyInput(kind="withdrawal", amount_try=90_000), RISK_OFFICER, now=NOW)
    with pytest.raises(ApiError) as err:
        await money.correct_movement(
            desk, _id(book, "start"), MovementCorrectInput(amount_try=50_000), RISK_OFFICER, now=NOW
        )
    assert (err.value.status, err.value.code) == (422, "over_cash")
    assert "eksiye" in err.value.detail
    assert (await own_book(desk, NOW)).cash == 10_000  # nothing was written
    assert await one(desk, "SELECT count(*) AS n FROM trading.book_ledger WHERE kind = 'correction'") == {"n": 0}


async def test_a_deposit_and_a_withdrawal_can_be_corrected_or_undone_and_stay_in_the_list(desk: DictConn) -> None:
    await empty_book(desk)
    await _start(desk, 100_000)
    dep = (await money.add_money(desk, MoneyInput(kind="deposit", amount_try=20_000), RISK_OFFICER, now=NOW)).body
    assert dep is not None
    deposit = _id(dep, "deposit")
    fixed = await money.correct_movement(desk, deposit, MovementCorrectInput(amount_try=2_000), RISK_OFFICER, now=NOW)
    assert fixed["cash"] == 102_000 and fixed["put_in"] == 102_000
    undone = await money.undo_movement(desk, deposit, RISK_OFFICER, now=NOW)
    assert (undone["cash"], undone["put_in"]) == (100_000, 100_000)
    row = next(m for m in undone["movements"] if m["id"] == deposit)
    assert (row["status"], row["amount_try"]) == ("undone", 2_000)
    assert await _audit(desk) == {"action": "money.undone", "payload": {"kind": "deposit", "amount_try": 2000.0}}
    with pytest.raises(ApiError) as again:
        await money.undo_movement(desk, deposit, RISK_OFFICER, now=NOW)
    assert again.value.code == "already_undone"
    with pytest.raises(ApiError) as gone:
        await money.correct_movement(desk, deposit, MovementCorrectInput(amount_try=5), RISK_OFFICER, now=NOW)
    assert gone.value.code == "already_undone"
    with pytest.raises(ApiError) as start:
        await money.undo_movement(desk, _id(undone, "start"), RISK_OFFICER, now=NOW)
    assert (start.value.status, start.value.code) == (409, "cannot_undo_start")
    # A withdrawal typed too large: fix it, the cash comes back by the difference.
    out = (await money.add_money(desk, MoneyInput(kind="withdrawal", amount_try=60_000), RISK_OFFICER, now=NOW)).body
    assert out is not None and out["cash"] == 40_000
    back = await money.correct_movement(
        desk, _id(out, "withdrawal"), MovementCorrectInput(amount_try=10_000), RISK_OFFICER, now=NOW
    )
    assert (back["cash"], back["put_in"]) == (90_000, 90_000)
    status = await risk_status(desk, NOW)
    assert status["daily_pnl_pct"] == 0 and status["drawdown_pct"] == 0


async def test_a_share_entered_by_hand_can_be_corrected_and_undone(desk: DictConn) -> None:
    await empty_book(desk)
    await _start(desk, 100_000)
    held = HoldingInput(ticker="KRGCL", qty=100, avg_cost=30.0, bought_on=date(2027, 1, 4))
    pos = await money.add_holding(desk, held, RISK_OFFICER, now=NOW)
    listed = await money.money_book(desk, NOW)
    holding = _id(listed, "holding")
    fixed = await money.correct_movement(
        desk, holding, MovementCorrectInput(qty=120, avg_cost=25.0, bought_on=date(2027, 1, 5)), RISK_OFFICER, now=NOW
    )
    assert fixed["cash"] == 100_000 and fixed["put_in"] == 103_000  # cost 120 x 25 = 3000, cash untouched
    row = next(m for m in fixed["movements"] if m["id"] == holding)
    assert (row["status"], row["amount_try"], row["original_amount_try"]) == ("corrected", 3_000, 3_000)
    positions = await list_positions(desk, NOW)
    assert [(p["qty"], p["avg_cost"]) for p in positions] == [(120, 25.0)]
    assert (await _audit(desk))["action"] == "holding.corrected"
    assert (await risk_status(desk, NOW))["daily_pnl_pct"] == 0  # not a gain
    undone = await money.undo_movement(desk, holding, RISK_OFFICER, now=NOW)
    assert undone["put_in"] == 100_000
    assert await list_positions(desk, NOW) == []
    assert (await _audit(desk))["action"] == "holding.undone"
    # A holding you already sold from cannot be changed.
    pos2 = await money.add_holding(desk, held, RISK_OFFICER, now=NOW)
    await money.sell_holding(
        desk, pos2["id"], HoldingSellInput(qty=10, price=31.0, sold_at=NOW, commission_try=1.0), RISK_OFFICER, now=NOW
    )
    second = next(
        m["id"]
        for m in (await money.money_book(desk, NOW))["movements"]
        if m["status"] == "active" and m["kind"] == "holding"
    )
    with pytest.raises(ApiError) as sold:
        await money.undo_movement(desk, second, RISK_OFFICER, now=NOW)
    assert (sold.value.status, sold.value.code) == (409, "has_sales")
    assert pos["id"] != pos2["id"]


async def _entered_ticket(conn: DictConn, *, commission: float | None = 25.5) -> dict[str, Any]:
    await empty_book(conn)
    await _start(conn, 1_000_000)
    await history(conn, "KRGCL", date(2027, 1, 11))
    ticket = (await approve(conn, KRGCL, DECIDE_AT)).events[1][1]
    entered = TicketMarkEntered(
        mark="entered", filled_qty=ticket["qty"], avg_price=ticket["limit_price"],
        filled_at=NOW + timedelta(minutes=5), commission_try=commission,
    )  # fmt: skip
    await service.mark_ticket(conn, ticket["ticket_no"], entered, RISK_OFFICER, now=NOW + timedelta(minutes=6))
    return dict(ticket)


async def test_a_recorded_fill_can_be_fixed_and_cash_and_position_follow(desk: DictConn) -> None:
    ticket = await _entered_ticket(desk)
    at = NOW + timedelta(minutes=30)
    qty, limit = ticket["qty"], ticket["limit_price"]
    new_qty, new_price = qty - 10, round(limit - 0.1, 2)
    out = await service.correct_fill(
        desk, ticket["ticket_no"], TicketCorrectInput(filled_qty=new_qty, avg_price=new_price, commission_try=12.0),
        RISK_OFFICER, now=at,
    )  # fmt: skip
    entry = out.body["entry"]
    assert (entry["filled_qty"], entry["avg_price"], entry["commission_try"], entry["corrected"]) == (
        new_qty,
        new_price,
        12.0,
        True,
    )
    book = await own_book(desk, at)
    paid = (Decimal(str(new_price)) * new_qty).quantize(Decimal("0.01")) + Decimal("12.00")
    assert book.cash == Decimal(1_000_000) - paid
    assert [(h.ticker, h.qty) for h in book.holdings] == [("KRGCL", new_qty)]
    pos = (await list_positions(desk, at))[0]
    assert (pos["qty"], pos["avg_cost"]) == (new_qty, new_price)
    audit = await _audit(desk)
    assert audit["action"] == "ticket.corrected"
    assert audit["payload"]["old"] == {"qty": qty, "price": limit, "commission_try": 25.5}
    assert audit["payload"]["new"] == {"qty": new_qty, "price": new_price, "commission_try": 12.0}
    assert await one(
        desk,
        "SELECT corrected_at IS NOT NULL AS c FROM trading.order_tickets WHERE ticket_no = %s",
        (ticket["ticket_no"],),
    ) == {"c": True}


async def test_a_fix_keeps_the_tickets_own_rules(desk: DictConn) -> None:
    ticket = await _entered_ticket(desk)
    no, qty, limit = ticket["ticket_no"], ticket["qty"], ticket["limit_price"]
    with pytest.raises(ApiError) as over_qty:
        await service.correct_fill(
            desk, no, TicketCorrectInput(filled_qty=qty + 1, avg_price=limit), RISK_OFFICER, now=NOW
        )
    assert over_qty.value.code == "over_qty"
    with pytest.raises(ApiError) as over_limit:
        await service.correct_fill(
            desk, no, TicketCorrectInput(filled_qty=qty, avg_price=limit + 1), RISK_OFFICER, now=NOW
        )
    assert over_limit.value.code == "over_limit"
    with pytest.raises(ApiError) as same:
        await service.correct_fill(
            desk, no, TicketCorrectInput(filled_qty=qty, avg_price=limit, commission_try=25.5), RISK_OFFICER, now=NOW
        )
    assert same.value.code == "no_change"
    with pytest.raises(ApiError) as missing:
        await service.correct_fill(desk, "T-yok", TicketCorrectInput(filled_qty=1, avg_price=1), RISK_OFFICER, now=NOW)
    assert missing.value.status == 404
    assert await one(desk, "SELECT count(*) AS n FROM trading.book_ledger WHERE kind = 'correction'") == {"n": 0}


async def test_the_brokers_own_commission_rate_is_used_and_named(desk: DictConn) -> None:
    await empty_book(desk)
    await _start(desk, 100_000)
    pos = await money.add_holding(
        desk, HoldingInput(ticker="KRGCL", qty=100, avg_cost=30.0, bought_on=date(2027, 1, 4)), RISK_OFFICER, now=NOW
    )
    view = await fee.view(desk)
    assert view["own"] is False and view["commission_rate"] == view["default_rate"]
    with pytest.raises(ApiError) as bad:
        await fee.set_rate(desk, 0.02, RISK_OFFICER, now=NOW)
    assert (bad.value.status, bad.value.code) == (422, "out_of_range")
    own = await fee.set_rate(desk, 0.002, RISK_OFFICER, now=NOW)
    assert own["own"] is True and own["commission_rate"] == 0.002
    assert await _audit(desk) == {"action": "fee.changed", "payload": {"old_rate": None, "new_rate": 0.002}}
    before = (await own_book(desk, NOW)).cash
    await money.sell_holding(desk, pos["id"], HoldingSellInput(qty=100, price=30.0, sold_at=NOW), RISK_OFFICER, now=NOW)
    # 100 x 30 = 3000; commission 6.00 + exchange fee 0.08 + BSMV 0.30 at binde 2.
    assert (await own_book(desk, NOW)).cash == before + Decimal("3000.00") - Decimal("6.38")
    back = await fee.set_rate(desk, None, RISK_OFFICER, now=NOW)
    assert back["own"] is False


async def test_a_ticket_fill_says_which_rate_estimated_its_commission(desk: DictConn) -> None:
    await empty_book(desk)
    await _start(desk, 1_000_000)
    await fee.set_rate(desk, 0.002, RISK_OFFICER, now=NOW)
    await history(desk, "KRGCL", date(2027, 1, 11))
    ticket = (await approve(desk, KRGCL, DECIDE_AT)).events[1][1]
    entered = TicketMarkEntered(
        mark="entered", filled_qty=ticket["qty"], avg_price=ticket["limit_price"], filled_at=NOW + timedelta(minutes=5)
    )
    done = await service.mark_ticket(desk, ticket["ticket_no"], entered, RISK_OFFICER, now=NOW + timedelta(minutes=6))
    entry = done.body["entry"]
    assert (entry["commission_estimated"], entry["commission_rate"], entry["commission_rate_own"]) == (
        True,
        0.002,
        True,
    )
    typed = TicketCorrectInput(filled_qty=ticket["qty"], avg_price=ticket["limit_price"], commission_try=9.0)
    fixed = await service.correct_fill(desk, ticket["ticket_no"], typed, RISK_OFFICER, now=NOW + timedelta(minutes=9))
    assert (fixed.body["entry"]["commission_estimated"], fixed.body["entry"]["commission_rate"]) == (False, None)


async def test_start_over_closes_the_book_keeps_history_and_leaves_the_kill_switch_on(desk: DictConn) -> None:
    ticket = await _entered_ticket(desk)
    await money.add_holding(
        desk, HoldingInput(ticker="KRGCL", qty=5, avg_cost=30.0, bought_on=date(2027, 1, 4)), RISK_OFFICER, now=NOW
    )
    await desk.execute("UPDATE trading.risk_state SET kill_switch = 'on', kill_reason = 'deneme', kill_at = now()")
    with pytest.raises(ApiError) as wrong:
        await fresh_start.start_over(desk, "evet", RISK_OFFICER, now=NOW + timedelta(hours=1))
    assert (wrong.value.status, wrong.value.code) == (422, "confirm")
    out = await fresh_start.start_over(desk, " BAŞTAN ", RISK_OFFICER, now=NOW + timedelta(hours=1))
    assert out == {"closed_book": 1, "kill_switch_on": True}
    audit = await _audit(desk)
    assert audit["action"] == "book.reset"
    assert audit["payload"]["closed_book"] == 1 and audit["payload"]["kill_switch_stays_on"] is True
    later = NOW + timedelta(hours=2)
    overview = await me_overview(desk, now=later)
    assert overview["needs_setup"] is True and overview["equity_now"] == 0.0
    assert await list_positions(desk, later) == []
    assert (await risk_status(desk, later))["kill_switch"] == "on"
    assert await one(desk, "SELECT count(*) AS n FROM trading.pnl_daily") == {"n": 0}
    assert await one(
        desk, "SELECT entry_status FROM trading.order_tickets WHERE ticket_no = %s", (ticket["ticket_no"],)
    ) == {"entry_status": "entered"}
    books = await fresh_start.previous_books(desk)
    assert len(books) == 1 and books[0]["no"] == 1 and books[0]["started_with"] == 1_000_000
    assert {p["ticker"] for p in books[0]["positions"]} == {"KRGCL"}
    assert [m["kind"] for m in books[0]["movements"]] == ["holding", "start"]
    # The new book starts empty and takes its own starting money; the old rows do not count.
    again = await money.add_money(desk, MoneyInput(kind="start", amount_try=5_000), RISK_OFFICER, now=later)
    assert again.body is not None and (again.body["cash"], again.body["put_in"]) == (5_000, 5_000)
    assert [m["kind"] for m in again.body["movements"]] == ["start"]
    with pytest.raises(ApiError) as nothing:
        await fresh_start.start_over(desk, "baştan", RISK_OFFICER, now=later)
        await fresh_start.start_over(desk, "baştan", RISK_OFFICER, now=later)
    assert nothing.value.code in {"not_started"}


async def test_start_over_voids_tickets_that_wait_and_needs_a_started_book(desk: DictConn) -> None:
    await empty_book(desk)
    with pytest.raises(ApiError) as early:
        await fresh_start.start_over(desk, "baştan", RISK_OFFICER, now=NOW)
    assert early.value.code == "not_started"
    await _start(desk, 1_000_000)
    await history(desk, "KRGCL", date(2027, 1, 11))
    ticket = (await approve(desk, KRGCL, DECIDE_AT)).events[1][1]
    out = await fresh_start.start_over(desk, "baştan", RISK_OFFICER, now=NOW + timedelta(minutes=1))
    assert out["kill_switch_on"] is False
    row = await one(
        desk, "SELECT entry_status, note FROM trading.order_tickets WHERE ticket_no = %s", (ticket["ticket_no"],)
    )
    assert row == {"entry_status": "canceled", "note": fresh_start.VOID_NOTE}


async def test_the_export_lists_every_row_including_fixes(desk: DictConn) -> None:
    await empty_book(desk)
    book = await _start(desk, 100_000)
    await money.correct_movement(
        desk, _id(book, "start"), MovementCorrectInput(amount_try=120_000.5, note="=1+1"), RISK_OFFICER, now=NOW
    )
    text = "".join(export.csv_lines(await export.records(desk)))
    lines = text.split("\r\n")
    assert text.startswith("﻿Defter;Kayıt no;Tarih;Tür")
    assert any("Başlangıç parası" in x and "Düzeltildi" in x and "100000,00" in x for x in lines)
    assert any("Düzeltme" in x and "20000,50" in x and "'=1+1" in x for x in lines)
