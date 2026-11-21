"""Param insights against the test database: allocation and the limit, closed trades from real ledger rows, notes with
their audit, the dollar line, and every document against the panel's zod schemas."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from kaptan.api.errors import ApiError
from kaptan.db import DictConn
from kaptan.domain.schemas import insights as schemas
from kaptan.insights import allocation, notes
from kaptan.insights.closed import closed_trades
from kaptan.insights.dividends import dividend_income
from kaptan.insights.stats import return_stats
from kaptan.insights.versus import versus
from kaptan.portfolio import ledger
from tests.contract.harness import assert_matches
from tests.integration.order_support import (
    DECIDE_AT,
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

NOW = DECIDE_AT
FRI = date(2027, 1, 8)
BOUGHT = NOW - timedelta(days=3)
PNL_SQL = (
    "INSERT INTO trading.pnl_daily (strategy, d, ord, equity, daily_return, peak_equity, drawdown, n_positions,"
    " n_trades) VALUES ('kaptan:v1.1-fwd', %s, %s, %s, %s, %s, 0, 1, 0)"
)


def _dump(model: type, doc: dict) -> dict:  # type: ignore[type-arg]
    return model.model_validate(doc).model_dump(mode="json", by_alias=True)  # type: ignore[no-any-return]


async def _bought(conn: DictConn, qty: int = 1000, price: str = "10") -> None:
    await empty_book(conn)
    await start_money(conn, 100_000, NOW - timedelta(days=4))
    await history(conn, "KRGCL", FRI, close=12.0)
    await ledger.add_fill(
        conn, side="buy", ticker="KRGCL", qty=qty, price=Decimal(price), commission=Decimal(20), estimated=False,
        filled_at=BOUGHT, now=BOUGHT,
    )  # fmt: skip


async def test_allocation_shares_the_whole_money_and_warns_over_the_limit(desk: DictConn) -> None:
    await _bought(desk)
    out = await allocation.allocation(desk, NOW)
    assert_matches("Allocation", _dump(schemas.Allocation, out))
    top = out["holdings"][0]
    assert top["ticker"] == "KRGCL" and top["pct"] == round(top["value_try"] / out["equity_try"] * 100, 1)
    assert out["threshold_pct"] == 25 and round(out["cash_pct"] + top["pct"]) == 100
    over = out["warning_tr"] is not None
    assert over == (top["pct"] > 25)


async def test_the_limit_is_stored_audited_and_changes_only_the_sentence(desk: DictConn) -> None:
    await _bought(desk)
    out = await allocation.set_threshold(desk, 5, RISK_OFFICER, NOW)
    assert out["threshold_pct"] == 5 and out["warning_tr"] is not None and "Sınırın %5" in out["warning_tr"]
    audit = await last_audit(desk)
    assert audit["action"] == "concentration.threshold_set" and audit["payload"] == {"threshold_pct": 5}
    again = await allocation.set_threshold(desk, 100, RISK_OFFICER, NOW)
    assert again["warning_tr"] is None


async def test_an_empty_book_says_nothing_it_does_not_know(desk: DictConn) -> None:
    await empty_book(desk)
    a = await allocation.allocation(desk, NOW)
    assert a["started"] is False and a["holdings"] == [] and a["warning_tr"] is None
    t = await closed_trades(desk)
    assert t["trades"] == [] and t["win_rate_pct"] is None
    s = await return_stats(desk)
    assert s["available"] is False and s["twr_pct"] is None
    v = await versus(desk)
    assert v["available"] is False and v["items"] == []
    d = await dividend_income(desk, NOW)
    assert d["total_try"] == 0 and len(d["months"]) == 12
    assert_matches("ReturnStats", _dump(schemas.ReturnStats, s))
    assert_matches("Versus", _dump(schemas.Versus, v))
    assert_matches("DividendIncome", _dump(schemas.DividendIncome, d))
    assert_matches("ClosedTrades", _dump(schemas.ClosedTrades, t))


async def test_a_sale_from_the_ledger_is_a_closed_trade(desk: DictConn) -> None:
    await _bought(desk)
    await ledger.add_fill(
        desk, side="sell", ticker="KRGCL", qty=400, price=Decimal("12"), commission=Decimal(8), estimated=False,
        filled_at=NOW, now=NOW,
    )  # fmt: skip
    out = await closed_trades(desk)
    assert_matches("ClosedTrades", _dump(schemas.ClosedTrades, out))
    (trade,) = out["trades"]
    assert (trade["qty"], trade["cost_try"], trade["proceeds_try"], trade["gain_try"]) == (400, 4008.0, 4792.0, 784.0)
    assert trade["days_held"] == 3 and out["win_rate_pct"] == 100.0 and out["total_gain_try"] == 784.0


async def test_stats_use_the_stored_flow_free_returns_and_the_dollar_line_reads_stored_rates(desk: DictConn) -> None:
    await empty_book(desk)
    for i, (d, r) in enumerate([(FRI, 0.02), (FRI + timedelta(days=3), -0.01)]):
        await desk.execute(PNL_SQL, (d, 9000 + i, 100_000, r, 100_000))
    s = await return_stats(desk)
    assert s["available"] and s["days"] == 2 and s["twr_pct"] == round((1.02 * 0.99 - 1) * 100, 2)
    assert s["worst_day"] == {"d": FRI + timedelta(days=3), "pct": -1.0}
    before = await versus(desk)
    usd = next(i for i in before["items"] if i["key"] == "usd")
    assert (
        usd["pct"] is None
        and usd["hidden_reason_tr"]
        and next(i for i in before["items"] if i["key"] == "inflation")["pct"] is None
    )
    for d, rate in ((FRI - timedelta(days=1), "30"), (FRI + timedelta(days=3), "33")):
        await desk.execute(
            "INSERT INTO core.fx_rates (d, currency, rate, available_at) VALUES (%s, 'USD', %s, %s)"
            " ON CONFLICT (d, currency) DO UPDATE SET rate = EXCLUDED.rate",
            (d, rate, datetime.combine(d, datetime.min.time()).replace(tzinfo=NOW.tzinfo)),
        )
    after = await versus(desk)
    assert next(i for i in after["items"] if i["key"] == "usd")["pct"] == 10.0
    assert_matches("Versus", _dump(schemas.Versus, after))


async def test_a_note_is_saved_replaced_cleared_and_audited(desk: DictConn) -> None:
    await _bought(desk)
    out = await notes.save_note(desk, "KRGCL", "  Temettü için aldım.  ", RISK_OFFICER, NOW)
    assert_matches("HoldingNotes", _dump(schemas.HoldingNotes, out))
    assert out["notes"][0]["body"] == "Temettü için aldım."
    audit = await last_audit(desk)
    assert (
        audit["action"] == "note.saved" and audit["payload"]["chars"] == 19 and "Temettü" not in str(audit["payload"])
    )
    again = await notes.save_note(desk, "KRGCL", "Yüzde 30 olunca satarım.", RISK_OFFICER, NOW)
    assert len(again["notes"]) == 1 and again["notes"][0]["body"].startswith("Yüzde 30")
    assert (await notes.clear_note(desk, "KRGCL", RISK_OFFICER))["notes"] == []
    assert (await last_audit(desk))["action"] == "note.cleared"
    with pytest.raises(ApiError) as err:
        await notes.clear_note(desk, "KRGCL", RISK_OFFICER)
    assert (err.value.status, err.value.code) == (404, "no_note")
    with pytest.raises(ApiError) as err2:
        await notes.save_note(desk, "THYAO", "Hiç almadım.", RISK_OFFICER, NOW)
    assert err2.value.code == "not_in_book"
    assert await one(desk, "SELECT count(*) AS n FROM trading.holding_notes") == {"n": 0}


__all__ += ["bar"]
