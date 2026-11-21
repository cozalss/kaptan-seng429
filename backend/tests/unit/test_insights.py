"""The pure parts of the Param insights: the ledger replay (closed trades), the return statistics, dividends."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from kaptan.insights import closed, dividends
from kaptan.insights.allocation import warning
from kaptan.insights.replay import replay
from kaptan.insights.stats import compute


def _row(
    id_: int, kind: str, at: datetime, qty: int, price: float | None, fee: float = 0, **extra: Any
) -> dict[str, Any]:
    return {
        "id": id_, "kind": kind, "occurred_at": at, "ticker": "KRGCL", "company": "Koru", "qty_delta": qty,
        "price": None if price is None else Decimal(str(price)), "commission_try": Decimal(str(fee)),
        "corrects_id": None, "new_qty": None, **extra,
    }  # fmt: skip


FRI = datetime(2027, 1, 8, 11, 0, tzinfo=UTC)
MON = datetime(2027, 1, 11, 11, 0, tzinfo=UTC)


def test_a_sale_is_matched_to_the_average_cost_with_commissions() -> None:
    rows = [_row(1, "buy", FRI, 100, 10, fee=10), _row(2, "sell", MON, -40, 12, fee=4)]
    trades, pools = replay(rows)
    assert len(trades) == 1
    t = trades[0]
    assert (t.qty, t.cost, t.proceeds, t.gain, t.days_held) == (40, Decimal(404), Decimal(476), Decimal(72), 3)
    assert pools["KRGCL"].qty == 60 and pools["KRGCL"].cost == Decimal(606)


def test_days_held_are_unknown_for_a_hand_entered_share() -> None:
    trades, _ = replay([_row(1, "holding", FRI, 100, 10), _row(2, "sell", MON, -100, 11)])
    assert trades[0].days_held is None
    out = closed.summarize(trades)
    assert out["avg_days_held"] is None and "alış günü bilinmediği" in out["note_tr"]


def test_oldest_shares_are_sold_first() -> None:
    early = datetime(2027, 1, 4, 11, 0, tzinfo=UTC)
    rows = [_row(1, "buy", early, 10, 10), _row(2, "buy", FRI, 10, 20), _row(3, "sell", MON, -10, 15)]
    trades, _ = replay(rows)
    assert trades[0].days_held == 7 and trades[0].cost == Decimal(150)  # average cost, oldest lot's age


def test_a_corrected_fill_counts_with_its_corrected_values() -> None:
    fix = _row(9, "correction", MON, 0, 11, corrects_id=1, new_qty=80)
    trades, pools = replay([_row(1, "buy", FRI, 100, 10), fix, _row(2, "sell", MON, -80, 12)])
    assert trades[0].cost == Decimal(880) and pools == {}


def test_a_bonus_issue_keeps_the_cost_and_a_sale_of_more_than_held_is_cut() -> None:
    rows = [_row(1, "buy", FRI, 100, 10), _row(2, "bonus", FRI, 100, 5), _row(3, "sell", MON, -150, 6)]
    trades, pools = replay(rows)
    assert trades[0].qty == 150 and trades[0].cost == Decimal(750) and pools["KRGCL"].qty == 50


def test_win_rate_and_totals() -> None:
    rows = [
        _row(1, "buy", FRI, 100, 10), _row(2, "sell", MON, -50, 12), _row(3, "sell", MON, -50, 8),
    ]  # fmt: skip
    out = closed.summarize(replay(rows)[0])
    assert (out["wins"], out["losses"], out["win_rate_pct"], out["total_gain_try"]) == (1, 1, 50.0, 0.0)
    assert closed.summarize([])["win_rate_pct"] is None


def test_stats_need_two_closes_and_chain_the_flow_free_returns() -> None:
    assert compute([(date(2027, 1, 8), 0.01)])["available"] is False
    days = [(date(2027, 1, 8), 0.10), (date(2027, 1, 11), -0.05), (date(2027, 1, 12), -0.05), (date(2027, 1, 13), 0.02)]
    s = compute(days)
    assert s["twr_pct"] == round((1.1 * 0.95 * 0.95 * 1.02 - 1) * 100, 2)
    assert s["best_day"] == {"d": date(2027, 1, 8), "pct": 10.0} and s["worst_day"]["pct"] == -5.0
    assert s["max_fall_pct"] == round((0.95 * 0.95 - 1) * 100, 2)
    assert (s["fall_from"], s["fall_to"]) == (date(2027, 1, 8), date(2027, 1, 12))
    assert "4 borsa günü" in s["caveat_tr"]


def test_dividend_months_year_totals_and_yield_on_cost() -> None:
    rows = [
        {"ticker": "KRGCL", "company": "Koru", "net_try": Decimal(850), "d": date(2026, 11, 5)},
        {"ticker": "KRGCL", "company": "Koru", "net_try": Decimal(100), "d": date(2025, 12, 1)},
        {"ticker": "KRGCL", "company": "Koru", "net_try": Decimal(40), "d": date(2024, 3, 1)},
    ]
    _, pools = replay([_row(1, "buy", FRI, 100, 100)])
    out = dividends.build(rows, pools, date(2026, 11, 21))
    assert (out["this_year_try"], out["last_year_try"], out["total_try"]) == (850.0, 100.0, 990.0)
    assert out["months"][0]["month"] == "2025-12" and out["months"][-1] == {
        "month": "2026-11",
        "total_try": 850.0,
    }
    assert out["holdings"][0]["last12_try"] == 950.0 and out["holdings"][0]["yield_on_cost_pct"] == 9.5


def test_the_concentration_sentence_names_the_share_and_the_limit() -> None:
    assert warning({"ticker": "KRGCL", "pct": 41.0}, 25) == "Paranın %41'i tek hissede (KRGCL). Sınırın %25."
    assert warning({"ticker": "KRGCL", "pct": 41.3}, 25) is not None and "%41,3" in str(
        warning({"ticker": "A", "pct": 41.3}, 25)
    )
    assert warning({"ticker": "KRGCL", "pct": 25.0}, 25) is None and warning(None, 25) is None
