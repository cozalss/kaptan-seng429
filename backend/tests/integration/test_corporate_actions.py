"""Dividends, bonus issues and rights issues on the person's book: income is income, a bonus is neither a gain nor a
loss (and never trips a stop), a correction is a new row, and the KAP notices only ask, never change anything."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from kaptan.api.errors import ApiError
from kaptan.db import DictConn
from kaptan.domain.schemas.corporate import BonusInput, CorporateBook, DividendInput, NoticeAnswer, RightsInput
from kaptan.domain.schemas.money import HoldingInput, HoldingSellInput
from kaptan.ingest import repo
from kaptan.ingest.normalize import normalize_rows
from kaptan.portfolio import corporate, corporate_notices, ledger, money
from kaptan.portfolio.overview import me_overview
from kaptan.portfolio.positions import list_positions
from kaptan.risk.book import own_book
from kaptan.risk.status import risk_status
from tests.contract.harness import assert_matches
from tests.ingest_support import list_main
from tests.integration.order_support import (
    DECIDE_AT,
    MON,
    RISK_OFFICER,
    bar,
    desk,
    empty_book,
    history,
    last_audit,
    one,
    start_money,
)

pytestmark = pytest.mark.integration
__all__ = ["desk"]

NOW = DECIDE_AT  # Monday 2027-01-11 14:00 Istanbul
FRI = date(2027, 1, 8)
BOUGHT = NOW - timedelta(days=3)  # Friday 14:00 Istanbul
START = Decimal(500_000)
STRATEGY = "kaptan:v1.1-fwd"
CLOSE_SQL = (
    "INSERT INTO trading.pnl_daily (strategy, d, ord, equity, daily_return, peak_equity, drawdown, n_positions,"
    " n_trades) VALUES (%s, %s, %s, %s, %s, %s, 0, 1, 0)"
)


async def _book_with_krgcl(conn: DictConn) -> None:
    """500 000 TL, 10 000 KRGCL held since Friday at 30 TL; KRGCL stood at 33.48 TL up to Friday's stored close."""
    await empty_book(conn)
    await start_money(conn, 500_000, NOW - timedelta(days=4))
    await history(conn, "KRGCL", FRI)
    held = HoldingInput(ticker="KRGCL", qty=10_000, avg_cost=30.0, bought_on=FRI)
    await money.add_holding(conn, held, RISK_OFFICER, now=BOUGHT)
    await conn.execute(CLOSE_SQL, (STRATEGY, FRI, 9000, 834800, 0, 834800))


async def test_a_dividend_is_income_not_a_flow(desk: DictConn) -> None:
    await _book_with_krgcl(desk)
    before = await own_book(desk, NOW)
    body = DividendInput(ticker="KRGCL", net_try=850.0, gross_try=1000.0, received_on=MON)
    out = await corporate.record_dividend(desk, body, RISK_OFFICER, now=NOW)
    after = await own_book(desk, NOW)
    assert after.cash == before.cash + 850 and after.equity == before.equity + 850
    assert after.put_in == before.put_in  # not money put in: a real return
    assert (await me_overview(desk, now=NOW))["pnl_abs"] == float(after.equity - after.put_in)
    assert_matches("CorporateBook", CorporateBook.model_validate(out).model_dump(mode="json"))  # as the route answers
    assert (out["this_year_try"], out["total_try"]) == (850.0, 850.0)
    assert out["per_holding"][0]["ticker"] == "KRGCL" and out["per_holding"][0]["total_try"] == 850.0
    assert (await last_audit(desk))["action"] == "dividend.recorded"
    sql = "SELECT flow_try, capital_delta, kind FROM trading.book_ledger ORDER BY id DESC LIMIT 1"
    assert await one(desk, sql) == {"flow_try": 0, "capital_delta": 0, "kind": "dividend"}
    assert (await risk_status(desk, NOW))["daily_pnl_pct"] > 0  # the money that arrived is a gain, honestly


async def test_a_dividend_is_undone_by_a_new_row_and_only_once(desk: DictConn) -> None:
    await _book_with_krgcl(desk)
    before = await own_book(desk, NOW)
    first = await corporate.record_dividend(
        desk, DividendInput(ticker="KRGCL", net_try=850.0, received_on=MON), RISK_OFFICER, now=NOW
    )
    record_id = first["records"][0]["id"]
    out = await corporate.undo_record(desk, record_id, RISK_OFFICER, now=NOW)
    assert (await own_book(desk, NOW)).cash == before.cash and out["total_try"] == 0
    assert [(r["corrects"], r["undone"]) for r in out["records"]] == [(record_id, False), (None, True)]
    assert (await last_audit(desk))["action"] == "dividend.corrected"
    for target, code in ((record_id, "already_undone"), (out["records"][0]["id"], "is_undo")):
        with pytest.raises(ApiError) as err:
            await corporate.undo_record(desk, target, RISK_OFFICER, now=NOW)
        assert (err.value.status, err.value.code) == (409, code)
    rows = await one(desk, "SELECT count(*) AS n FROM trading.book_ledger WHERE kind = 'dividend'")
    assert rows == {"n": 2}  # nothing was deleted


async def test_dividend_errors(desk: DictConn) -> None:
    await empty_book(desk)
    first = DividendInput(ticker="KRGCL", net_try=1, received_on=MON)
    with pytest.raises(ApiError) as err:
        await corporate.record_dividend(desk, first, RISK_OFFICER, now=NOW)
    assert err.value.code == "not_started"
    await _book_with_krgcl(desk)
    bad = [
        (DividendInput(ticker="THYAO", net_try=1, received_on=MON), "never_held"),
        (DividendInput(ticker="KRGCL", net_try=1, received_on=MON + timedelta(days=1)), "future_date"),
    ]
    for body, code in bad:
        with pytest.raises(ApiError) as err:
            await corporate.record_dividend(desk, body, RISK_OFFICER, now=NOW)
        assert err.value.code == code


async def test_a_bonus_issue_keeps_the_cost_and_trips_no_stop(desk: DictConn) -> None:
    await _book_with_krgcl(desk)
    await bar(desk, "KRGCL", MON, close=16.74)  # the 1:2 bonus day: the raw price halves, -20 % of the whole book
    # 1) the price history shows the bonus (İş Yatırım's factor) but the person has not recorded it yet
    await desk.execute(
        "INSERT INTO core.corporate_actions (ticker, ex_date, kind, bonus_capital_pct, factor, source)"
        " VALUES ('KRGCL', %s, 'bedelsiz', 100, 0.5, 'isyatirim')",
        (MON,),
    )
    waiting = await risk_status(desk, NOW)
    assert waiting["daily_pnl_pct"] > -0.001 and waiting["drawdown_pct"] > -0.001  # not -50 %
    # 2) the person records it: 100 -> 200 shares
    body = BonusInput(ticker="KRGCL", ex_date=MON, bonus_pct=100)
    out = await corporate.record_bonus(desk, body, RISK_OFFICER, now=NOW)
    book = await own_book(desk, NOW)
    status = await risk_status(desk, NOW)
    assert status["daily_pnl_pct"] > -0.001 and status["drawdown_pct"] > -0.001  # neither -1 % nor -5 % trips
    assert book.cash == START and book.put_in == START + 300_000
    assert book.equity == START + 20_000 * Decimal("16.74")
    pos = (await list_positions(desk, NOW))[0]
    assert pos["qty"] == 20_000 and pos["avg_cost"] == 15.0  # the total cost, 300 000, is unchanged
    assert out["records"][0]["qty_after"] == 20_000 and out["records"][0]["qty_added"] == 10_000
    assert (await last_audit(desk))["action"] == "bonus.recorded"
    assert await one(desk, "SELECT count(*) AS n FROM trading.book_ledger WHERE kind = 'bonus'") == {"n": 1}
    sql = "SELECT equity FROM trading.pnl_daily WHERE strategy = %s AND d = %s"
    assert await one(desk, sql, (STRATEGY, MON)) is None  # no close existed for Monday yet: none was invented


async def test_a_late_bonus_corrects_the_close_already_stored(desk: DictConn) -> None:
    await _book_with_krgcl(desk)
    await bar(desk, "KRGCL", MON, close=16.74)
    # computed before the bonus was known: 10 000 shares at the new price
    await desk.execute(CLOSE_SQL, (STRATEGY, MON, 9001, 667400, -0.2, 834800))
    body = BonusInput(ticker="KRGCL", ex_date=MON, new_qty=20_000)
    await corporate.record_bonus(desk, body, RISK_OFFICER, now=NOW)
    sql = "SELECT equity, daily_return FROM trading.pnl_daily WHERE strategy = %s AND d = %s"
    row = await one(desk, sql, (STRATEGY, MON))
    assert row is not None and float(row["equity"]) == pytest.approx(500_000 + 20_000 * 16.74, abs=1)
    assert float(row["daily_return"]) > -0.001


async def test_a_bonus_is_undone_and_its_errors(desk: DictConn) -> None:
    await _book_with_krgcl(desk)
    for body, code in (
        (BonusInput(ticker="KRGCL", ex_date=MON, new_qty=10_000), "not_more"),
        (BonusInput(ticker="KRGCL", ex_date=MON + timedelta(days=1), new_qty=20_000), "future_date"),
    ):
        with pytest.raises(ApiError) as err:
            await corporate.record_bonus(desk, body, RISK_OFFICER, now=NOW)
        assert err.value.code == code
    with pytest.raises(ApiError) as err:
        await corporate.record_bonus(desk, BonusInput(ticker="THYAO", ex_date=MON, new_qty=2), RISK_OFFICER, now=NOW)
    assert (err.value.status, err.value.code) == (409, "not_held")
    body = BonusInput(ticker="KRGCL", ex_date=MON, new_qty=20_000)
    out = await corporate.record_bonus(desk, body, RISK_OFFICER, now=NOW)
    undone = await corporate.undo_record(desk, out["records"][0]["id"], RISK_OFFICER, now=NOW)
    pos = (await list_positions(desk, NOW))[0]
    assert (pos["qty"], pos["avg_cost"]) == (10_000, 30.0) and undone["records"][1]["undone"] is True
    assert sum(s.qty for s in await ledger.shares(desk, NOW)) == 10_000
    # shares sold after the bonus: it can no longer be taken back
    out = await corporate.record_bonus(desk, body, RISK_OFFICER, now=NOW)
    pos = (await list_positions(desk, NOW))[0]
    sell = HoldingSellInput(qty=10, price=17.0, sold_at=NOW, commission_try=1.0)
    await money.sell_holding(desk, pos["id"], sell, RISK_OFFICER, now=NOW)
    with pytest.raises(ApiError) as err:
        await corporate.undo_record(desk, out["records"][0]["id"], RISK_OFFICER, now=NOW)
    assert (err.value.status, err.value.code) == (409, "changed")


async def test_a_rights_issue_pays_cash_and_raises_the_cost(desk: DictConn) -> None:
    await _book_with_krgcl(desk)
    body = RightsInput(ticker="KRGCL", subscribed_on=MON, qty=50, price=10.0)
    out = await corporate.record_rights(desk, body, RISK_OFFICER, now=NOW)
    book = await own_book(desk, NOW)
    assert book.cash == START - 500 and book.put_in == START + 300_000  # paid from cash; no outside money
    pos = (await list_positions(desk, NOW))[0]
    assert pos["qty"] == 10_050 and pos["avg_cost"] == pytest.approx((300_000 + 500) / 10_050)
    assert out["records"][0]["kind"] == "rights" and out["records"][0]["net_try"] == 500.0
    assert (await last_audit(desk))["action"] == "rights.recorded"
    with pytest.raises(ApiError) as err:
        await corporate.record_rights(desk, body.model_copy(update={"price": 1e7}), RISK_OFFICER, now=NOW)
    assert err.value.code == "over_cash"
    await corporate.undo_record(desk, out["records"][0]["id"], RISK_OFFICER, now=NOW)
    assert (await own_book(desk, NOW)).cash == START


async def test_kap_notices_ask_and_change_nothing(desk: DictConn) -> None:
    await empty_book(desk)
    then = datetime(2026, 10, 20, 9, 0, tzinfo=UTC)
    await start_money(desk, 100_000, datetime(2026, 10, 1, 9, 0, tzinfo=UTC))
    for ticker in ("SUMAS", "AYES"):
        await ledger.add_holding(
            desk, ticker=ticker, qty=100, avg_cost=Decimal(10), market_value=Decimal(1000),
            equity_before=Decimal(100_000), position_id=0, now=datetime(2026, 10, 2, 9, 0, tzinfo=UTC),
        )  # fmt: skip
    await desk.execute(
        "INSERT INTO trading.positions (book, origin, ticker, company_name, qty, avg_cost, last_price, opened_at,"
        " planned_exit_date, strategy_version, realized_pnl)"
        " VALUES ('personal', 'own', 'AYES', 'Ayes', 100, 10, 10, %s, %s, '', 0)",
        (datetime(2026, 10, 2, 9, 0, tzinfo=UTC), date(2026, 10, 2)),
    )
    rows = [r for r in list_main(date(2026, 10, 15)) if r["disclosureBasic"]["disclosureIndex"] in (1682772, 1682658)]
    found, errors = normalize_rows(rows, source="backfill", seen_at=None)
    assert not errors
    index = await repo.load_company_index(desk)
    for d in found:
        await repo.upsert_disclosure(desk, d, index, visible=True)
    cash_before = (await own_book(desk, then)).cash
    got = await corporate_notices.notices(desk, then)
    assert sorted((n["ticker"], n["kind"]) for n in got) == [("AYES", "bonus"), ("SUMAS", "dividend")]
    assert_matches("NoticeAnswer", NoticeAnswer.model_validate({"notices": got}).model_dump(mode="json"))
    dividend = next(n for n in got if n["kind"] == "dividend")
    assert dividend["held_qty"] == 100 and dividend["per_share_gross_try"] is None
    assert "okuyamadım" in dividend["facts_note"]
    assert (await own_book(desk, then)).cash == cash_before  # nothing moved
    await corporate_notices.dismiss(desk, dividend["id"], RISK_OFFICER, now=then)
    assert [n["kind"] for n in await corporate_notices.notices(desk, then)] == ["bonus"]
    # recording the bonus (from the prompt) closes it
    bonus = next(n for n in got if n["kind"] == "bonus")
    answer = BonusInput(ticker="AYES", ex_date=date(2026, 10, 20), new_qty=200, notice_id=bonus["id"])
    await corporate.record_bonus(desk, answer, RISK_OFFICER, now=then)
    assert await corporate_notices.notices(desk, then) == []
    assert await corporate_notices.notices(desk, then + timedelta(days=60)) == []
    with pytest.raises(ApiError):
        await corporate_notices.dismiss(desk, "bildirim-1", RISK_OFFICER, now=then)
