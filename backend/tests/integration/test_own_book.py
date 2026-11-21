"""One book, the person's own: money in, an approved suggestion, the real fill with its commission, deposits and
withdrawals that are neither gain nor loss, a share held before KAPtan, and the errors of every money write."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from kaptan.api.errors import ApiError
from kaptan.approvals import service
from kaptan.db import DictConn
from kaptan.disclosures.counters import day_counters
from kaptan.domain.schemas.money import HoldingInput, HoldingSellInput, MoneyInput
from kaptan.domain.schemas.trading import TicketMarkEntered
from kaptan.portfolio import money
from kaptan.portfolio.overview import me_overview
from kaptan.portfolio.positions import list_positions
from kaptan.risk.book import own_book
from kaptan.risk.status import risk_status
from tests.integration.order_support import DECIDE_AT, KRGCL, RISK_OFFICER, approve, desk, history, one

pytestmark = pytest.mark.integration
__all__ = ["desk"]

NOW = DECIDE_AT
START = Decimal(500_000)


async def _empty_book(conn: DictConn) -> None:
    for sql in ("DELETE FROM trading.book_ledger", "DELETE FROM trading.positions", "DELETE FROM trading.pnl_daily"):
        await conn.execute(sql)


async def _start(conn: DictConn, amount: int = 500_000) -> None:
    await money.add_money(conn, MoneyInput(kind="start", amount_try=amount), RISK_OFFICER, now=NOW - timedelta(days=1))


async def test_before_the_starting_money_everything_is_zero_and_waiting(desk: DictConn) -> None:
    await _empty_book(desk)
    overview = await me_overview(desk, now=NOW)
    assert overview["needs_setup"] is True
    assert (overview["capital_start"], overview["equity_now"], overview["cash"]) == (0.0, 0.0, 0.0)
    assert overview["allocations"] == [] and overview["open_suggestions"] == [] and overview["pnl_pct"] == 0.0
    status = await risk_status(desk, NOW)
    assert (status["equity"], status["daily_pnl_pct"], status["drawdown_pct"]) == (0, 0.0, 0.0)
    assert (await day_counters(desk, NOW))["waiting_for_money"] is True
    for kind in ("deposit", "withdrawal"):
        with pytest.raises(ApiError) as err:
            await money.add_money(desk, MoneyInput(kind=kind, amount_try=10), RISK_OFFICER, now=NOW)
        assert (err.value.status, err.value.code) == (409, "not_started")


async def test_money_errors_and_audit(desk: DictConn) -> None:
    await _empty_book(desk)
    await _start(desk)
    assert (await day_counters(desk, NOW))["waiting_for_money"] is False
    audit = await one(desk, "SELECT action, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1")
    assert audit == {"action": "money.started", "payload": {"amount_try": 500000.0}}
    with pytest.raises(ApiError) as twice:
        await money.add_money(desk, MoneyInput(kind="start", amount_try=1), RISK_OFFICER, now=NOW)
    assert (twice.value.status, twice.value.code) == (409, "already_started")
    with pytest.raises(ApiError) as over:
        await money.add_money(desk, MoneyInput(kind="withdrawal", amount_try=500_001), RISK_OFFICER, now=NOW)
    assert (over.value.status, over.value.code, over.value.detail) == (
        422,
        "over_cash",
        "Elindeki nakitten fazlasını çekemezsin.",
    )
    outcome = await money.add_money(desk, MoneyInput(kind="withdrawal", amount_try=100_000), RISK_OFFICER, now=NOW)
    body = outcome.body or {}
    assert body["cash"] == 400_000 and body["put_in"] == 400_000
    assert [m["kind"] for m in body["movements"]] == ["withdrawal", "start"]


async def test_a_deposit_is_not_a_gain_and_a_withdrawal_is_not_a_loss(desk: DictConn) -> None:
    await _empty_book(desk)
    await _start(desk)
    await money.add_money(desk, MoneyInput(kind="deposit", amount_try=500_000), RISK_OFFICER, now=NOW)
    status = await risk_status(desk, NOW)
    assert status["equity"] == 1_000_000 and status["daily_pnl_pct"] == 0 and status["drawdown_pct"] == 0
    await money.add_money(desk, MoneyInput(kind="withdrawal", amount_try=250_000), RISK_OFFICER, now=NOW)
    status = await risk_status(desk, NOW)
    assert status["equity"] == 750_000 and status["daily_pnl_pct"] == 0 and status["drawdown_pct"] == 0


async def test_a_share_held_before_kaptan_counts_but_gets_no_exit(desk: DictConn) -> None:
    await _empty_book(desk)
    await _start(desk)
    held = HoldingInput(ticker="KRGCL", qty=100, avg_cost=30.0, bought_on=date(2027, 1, 4))
    pos = await money.add_holding(desk, held, RISK_OFFICER, now=NOW)
    assert (pos["origin"], pos["source_proposal"], pos["run_id"], pos["event_type"]) == ("own", "", "", "IGNORE")
    assert pos["planned_exit_date"] == date(2027, 1, 4) and pos["book"] == "personal"
    book = await own_book(desk, NOW)
    assert book.cash == START and book.equity == START + 3000 and book.put_in == START + 3000
    assert (await risk_status(desk, NOW))["daily_pnl_pct"] == 0  # the share is not a gain
    with pytest.raises(ApiError) as bad:
        await money.add_holding(desk, held.model_copy(update={"ticker": "ZZZZZ"}), RISK_OFFICER, now=NOW)
    assert (bad.value.status, bad.value.code) == (422, "unknown_ticker")
    with pytest.raises(ApiError) as future:
        await money.add_holding(desk, held.model_copy(update={"bought_on": date(2027, 2, 1)}), RISK_OFFICER, now=NOW)
    assert future.value.code == "future_date"

    sell = HoldingSellInput(qty=40, price=35.0, sold_at=NOW, commission_try=10.0)
    left = await money.sell_holding(desk, pos["id"], sell, RISK_OFFICER, now=NOW)
    assert left is not None and left["qty"] == 60
    assert (await own_book(desk, NOW)).cash == START + Decimal("1390.00")  # 40 x 35 - 10
    with pytest.raises(ApiError) as over:
        await money.sell_holding(desk, pos["id"], sell.model_copy(update={"qty": 61}), RISK_OFFICER, now=NOW)
    assert over.value.code == "over_qty"
    assert await money.sell_holding(desk, pos["id"], sell.model_copy(update={"qty": 60}), RISK_OFFICER, now=NOW) is None
    assert await list_positions(desk, NOW) == []


async def test_the_whole_life_of_a_suggestion(desk: DictConn) -> None:
    await _empty_book(desk)
    await _start(desk, 1_000_000)
    await history(desk, "KRGCL", date(2027, 1, 11))
    outcome = await approve(desk, KRGCL, DECIDE_AT)
    assert [e for e, _ in outcome.events] == ["approval.decided", "ticket"]  # no simulated order
    assert await one(desk, "SELECT count(*) AS n FROM trading.orders WHERE proposal_id = %s", (KRGCL,)) == {"n": 0}
    ticket = outcome.events[1][1]
    assert "örnek değer" not in ticket["evidence_line_tr"]
    assert ticket["account_equity_try"] == 1_000_000 and ticket["est_notional_try"] <= 100_000
    assert (await own_book(desk, NOW)).reserved > 0  # waiting to be entered: cash is held back
    qty, price = ticket["qty"], ticket["limit_price"]

    entered = TicketMarkEntered(
        mark="entered", filled_qty=qty, avg_price=price, filled_at=NOW + timedelta(minutes=5), commission_try=25.5
    )
    done = await service.mark_ticket(desk, ticket["ticket_no"], entered, RISK_OFFICER, now=NOW + timedelta(minutes=6))
    entry = done.body["entry"]
    assert (entry["commission_try"], entry["commission_estimated"], entry["late"]) == (25.5, False, False)
    book = await own_book(desk, NOW + timedelta(minutes=10))
    assert book.cash == Decimal(1_000_000) - (Decimal(str(price)) * qty).quantize(Decimal("0.01")) - Decimal("25.50")
    assert book.reserved == 0 and [(h.ticker, h.qty) for h in book.holdings] == [("KRGCL", qty)]
    assert (await list_positions(desk, NOW + timedelta(minutes=10)))[0]["origin"] == "suggestion"


async def test_a_late_fill_without_a_typed_commission_is_kept_and_estimated(desk: DictConn) -> None:
    await _empty_book(desk)
    await _start(desk, 1_000_000)
    await history(desk, "KRGCL", date(2027, 1, 11))
    outcome = await approve(desk, KRGCL, DECIDE_AT)
    ticket = outcome.events[1][1]
    late_at = datetime.fromisoformat(ticket["valid_until"].replace("Z", "+00:00")) + timedelta(hours=1)
    entered = TicketMarkEntered(
        mark="entered", filled_qty=ticket["qty"], avg_price=ticket["limit_price"], filled_at=late_at
    )
    done = await service.mark_ticket(desk, ticket["ticket_no"], entered, RISK_OFFICER, now=late_at)
    entry = done.body["entry"]
    assert entry["late"] is True and entry["commission_estimated"] is True and entry["commission_try"] > 0
