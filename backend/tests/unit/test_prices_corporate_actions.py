"""Corporate actions: factor formulas, detection on real data (FROTO 2025), cross-checks (07 §6)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from kaptan.prices.corporate_actions import (
    bonus_factor,
    dividend_factor,
    from_yahoo,
    implied_from_isyatirim,
    reconcile,
    rights_factor,
)
from kaptan.prices.ingest import fetch_ticker
from kaptan.prices.models import CorporateAction, DailyBar
from kaptan.prices.yahoo import YahooSeries, YahooSplit, fetch_chart
from tests.fixtures.prices.cassette import replay_client

FROTO = ("FROTO", date(2025, 4, 1), date(2025, 6, 30))
D = Decimal


def test_factor_formulas() -> None:
    assert bonus_factor(D("313.77"), D("86.23")) == D("0.2")  # THYAO 2009-06-25
    assert bonus_factor(D(900)) == D("0.1")
    # 100 % rights at 1 TL on a 10 TL stock: TERP = (10 + 1) / 2 = 5.5 → 0.55
    assert rights_factor(D(10), D(100), D(1)) == D("0.55")
    assert dividend_factor(D(100), D(2)) == D("0.98")


async def test_froto_2025_actions_are_detected_and_classified() -> None:
    async with replay_client() as client:
        fetched = await fetch_ticker(client, *FROTO)
    actions = {(a.ex_date, a.kind): a for a in fetched.actions}
    assert set(actions) == {(date(2025, 4, 3), "temettu"), (date(2025, 5, 7), "bedelsiz")}
    bonus = actions[(date(2025, 5, 7), "bedelsiz")]
    assert bonus.factor == D("0.1") and bonus.bonus_capital_pct == D(900) and bonus.source == "isyatirim"
    div = actions[(date(2025, 4, 3), "temettu")]
    assert D("0.98") < div.factor < D("0.99")
    assert div.cash_gross is not None and abs(div.cash_gross - D("17.10")) < D("0.05")  # raw TL per share
    assert div.note is not None and "yahoo dividend 1.71" in div.note


async def test_adjusted_series_matches_isyatirim_and_yahoo_within_half_a_percent() -> None:
    """07 §6 cross-check: our raw × factors vs İş Yatırım HGDG_KAPANIS and Yahoo adjclose, on ≥ 99 % of days."""
    async with replay_client() as client:
        fetched = await fetch_ticker(client, *FROTO)
        series = await fetch_chart(client, *FROTO)
    raw = sorted(fetched.raw, key=lambda b: b.d)

    def ours(b: DailyBar) -> Decimal:
        f = D(1)
        for a in fetched.actions:
            if a.ex_date > b.d:
                f *= a.factor
        return b.close * f

    last = raw[-1]
    yahoo = {y.d: y.adj_close for y in series.bars}
    ok_isy = ok_yahoo = n_yahoo = 0
    for b in raw:
        assert b.ref_adj_close is not None and last.ref_adj_close is not None
        mine = ours(b) / ours(last)
        ok_isy += abs(mine / (b.ref_adj_close / last.ref_adj_close) - 1) < D("0.005")
        if b.d in yahoo:
            n_yahoo += 1
            ok_yahoo += abs(mine / (yahoo[b.d] / yahoo[last.d]) - 1) < D("0.005")
    assert ok_isy == len(raw)
    assert ok_yahoo >= 0.99 * n_yahoo and n_yahoo > 55


def _bar(d: int, close: str, adj: str, cap: str | None) -> DailyBar:
    return DailyBar(
        ticker="TEST1",
        d=date(2026, 9, d),
        close=D(close),
        source="isyatirim",
        price_basis="raw",
        ref_adj_close=D(adj),
        capital_try=D(cap) if cap else None,
    )


def test_classification_of_synthetic_actions() -> None:
    bars = [
        _bar(1, "10", "5", "100"),
        _bar(2, "10", "5", "100"),  # nothing
        _bar(3, "10", "5.5", "200"),  # capital ×2 but factor 0.909 → bedelli (rights)
        _bar(4, "10", "6.0", "150"),  # capital down → other
        _bar(7, "10", "5.0", "150"),  # factor > 1, same capital → other
        _bar(8, "10", "5.0", None),
        _bar(9, "10", "5.2", None),  # factor < 1, unknown capital → dividend
        _bar(10, "10", "5.2", None),
    ]
    kinds = [(a.ex_date.day, a.kind) for a in implied_from_isyatirim(bars)]
    assert kinds == [(3, "bedelli"), (4, "other"), (7, "other"), (9, "temettu")]
    assert implied_from_isyatirim([_bar(1, "10", "0", None), _bar(2, "10", "5", None)]) == []


def test_reconcile_and_yahoo_only_actions() -> None:
    split_day = date(2026, 9, 3)
    series = YahooSeries("TEST1", (), (YahooSplit(split_day, D(2), D(1)),), ())
    rights = CorporateAction("TEST1", split_day, "bedelli", D("0.5"), "isyatirim")
    [fixed] = reconcile([rights], series, has_isyatirim=True)
    assert fixed.kind == "bedelsiz" and fixed.factor == D("0.5")
    assert reconcile([rights], None, has_isyatirim=True) == [rights]
    assert reconcile([], None, has_isyatirim=False) == []
    [only] = reconcile([], series, has_isyatirim=False)
    assert (only.kind, only.factor, only.bonus_capital_pct, only.source) == ("bedelsiz", D("0.5"), D(100), "yfinance")


async def test_yahoo_only_dividend_factor() -> None:
    async with replay_client() as client:
        series = await fetch_chart(client, *FROTO)
    actions = from_yahoo(series)
    assert [(a.ex_date, a.kind) for a in actions] == [(date(2025, 4, 3), "temettu"), (date(2025, 5, 7), "bedelsiz")]
    assert D("0.98") < actions[0].factor < D("0.99")
