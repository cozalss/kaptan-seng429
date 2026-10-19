"""E1 / E2 / E4 merge features by hand (06 §3.1, §3.2, §3.4) and the E3 FX helpers, no Postgres."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal as D  # noqa: N817
from typing import Any

from kaptan.market.features import MergeInputs, amount_try, fx_text_amounts, limits_of, live_features
from kaptan.market.fundamentals import FundamentalRow, cfo_quality, e4_features, sue
from kaptan.market.notices import Notice, buyback_features, cluster, insider_features, lookback_start
from kaptan.prices.calendar import IST

T = "TSTAA"
PUB = datetime(2026, 10, 14, 19, 0, tzinfo=IST)  # Wednesday after the close; window = 10 sessions to 10-14
SELF = 900


def buyback(index: int, published: datetime, txns: list[tuple[str, str]], **extra: Any) -> Notice:
    parsed = {
        "kind": "buyback",
        "nature": extra.pop("nature", "Geri alım işlemi"),
        "transactions": [{"ticker": T, "date": d, "nominal_try": n, "price_try": "40.5"} for d, n in txns],
    }
    return Notice(index, published, extra.pop("subject", "Payların Geri Alınmasına İlişkin Bildirim"), "E1", parsed)


def test_e1_ten_session_sum_counts_each_trade_once_and_skips_old_ones() -> None:
    rows = [
        buyback(1, datetime(2026, 9, 25, 18, tzinfo=IST), [("2026-09-25", "500000")]),  # 13 sessions back: out
        buyback(2, datetime(2026, 10, 6, 18, tzinfo=IST), [("2026-10-06", "1000000"), ("2026-10-02", "300000")]),
        buyback(3, datetime(2026, 10, 9, 18, tzinfo=IST), [("2026-10-06", "1000000"), ("2026-10-09", "700000")]),
        buyback(SELF, PUB, [("2026-10-14", "1500000")]),
    ]
    f = buyback_features(rows, SELF, PUB, T, D(1_000_000_000), None)
    # 10-02 is the 9th session back (10-01 … 10-14 = 10 sessions) → in; 10-06 quoted twice → once
    assert f.nominal_10d == D(3_500_000) and f.capital_pct == D("0.0035")
    assert (f.notice_count, f.sale_within_20d, f.new_rows) == (3, False, 1)
    assert buyback_features(rows, SELF, PUB, T, None, None).capital_pct is None  # no capital → unknown


def test_e1_reader_fallback_other_tickers_and_sales() -> None:
    reader = {"transactions": [{"trade_date": "2026-10-14", "nominal_tl": 2_000_000, "price_tl": 41.0}]}
    other = Notice(5, datetime(2026, 10, 13, 18, tzinfo=IST), "x", "E1", {"kind": "buyback", "transactions": [
        {"ticker": "OTHER", "date": "2026-10-13", "nominal_try": "9000000"}]})  # fmt: skip
    sale = buyback(6, datetime(2026, 9, 22, 18, tzinfo=IST), [], subject="Geri Alınan Payların Elden Çıkarılması")
    me = Notice(SELF, PUB, "Payların Geri Alınmasına İlişkin Bildirim", "E1", None)
    f = buyback_features([sale, other, me], SELF, PUB, T, D(400_000_000), reader)
    assert f.nominal_10d == D(2_000_000) and f.capital_pct == D("0.005") and f.new_rows == 1
    assert f.sale_within_20d is True and f.notice_count == 1  # the other company's rows are not ours
    by_nature = buyback(7, datetime(2026, 10, 1, 18, tzinfo=IST), [], nature="Geri alınan payların satışı")
    assert buyback_features([by_nature, me], SELF, PUB, T, D(1), reader).sale_within_20d is True
    assert lookback_start(PUB) == datetime(2026, 9, 14, tzinfo=IST)  # 30 days back beats 20 sessions


def insider(index: int, published: datetime, rows: list[tuple[str, str, str, str, str]], **kw: Any) -> Notice:
    cols = ("date", "buy_nominal_try", "sell_nominal_try", "start_nominal_try", "end_nominal_try")
    parsed = {"kind": "insider_trade", "rows": [dict(zip(cols, r, strict=True)) for r in rows], **kw}
    return Notice(index, published, "Pay Alım Satım Bildirimi", "E2", parsed)


def test_e2_net_value_from_the_table_and_the_price_range() -> None:
    me = insider(SELF, PUB, [("2026-10-13", "30000", "0", "100000", "130000"), ("2026-10-14", "20000", "5000",
                 "130000", "145000")], price_low_try="40", price_high_try="44")  # fmt: skip
    f = insider_features([me], SELF, PUB, None)
    assert (f.net_nominal, f.avg_price, f.net_value_try) == (D(45_000), D(42), D(1_890_000))
    assert f.cluster_30d == 1


def test_e2_cluster_chains_filings_of_one_holder_and_ignores_old_ones() -> None:
    a1 = insider(1, PUB - timedelta(days=20), [("2026-09-24", "1000", "0", "5000", "6000")])
    a2 = insider(2, PUB - timedelta(days=10), [("2026-10-04", "500", "0", "6000", "6500")])  # same holder (6000)
    b = insider(3, PUB - timedelta(days=5), [("2026-10-09", "2000", "0", "70000", "72000")])
    seller = insider(4, PUB - timedelta(days=3), [("2026-10-11", "0", "900", "9000", "8100")])
    old = insider(5, PUB - timedelta(days=45), [("2026-08-30", "4000", "0", "1000", "5000")])
    me = insider(SELF, PUB, [("2026-10-14", "100", "0", "6500", "6600")], price_low_try="10", price_high_try="10")
    f = insider_features([old, a1, a2, b, seller, me], SELF, PUB, None)
    assert f.cluster_30d == 2  # holder A (a1→a2→me) and holder B; the seller nets < 0; `old` is outside 30 days


def test_e2_reader_only_and_unknown_cases() -> None:
    reader = {"direction": "buy", "trades": [{"qty": 10_000, "price_tl": 50.0, "value_tl": None},
                                             {"qty": 5_000, "price_tl": None, "value_tl": 260_000}]}  # fmt: skip
    attach = Notice(SELF, PUB, "Pay Alım Satım Bildirimi", "E2", {"kind": "insider_trade", "rows": []})
    f = insider_features([attach], SELF, PUB, reader)
    assert (f.net_nominal, f.net_value_try, f.cluster_30d) == (D(15_000), D(760_000), 1)
    assert insider_features([attach], SELF, PUB, {"direction": "mixed", "trades": []}).net_value_try is None
    no_value = {"direction": "sell", "trades": [{"qty": 100, "price_tl": None, "value_tl": None}]}
    g = insider_features([attach], SELF, PUB, no_value)
    assert (g.net_nominal, g.net_value_try, g.cluster_30d) == (D(-100), None, 0)
    priced = insider(SELF, PUB, [("2026-10-14", "1000", "0", "1", "1001")])
    h = insider_features([priced], SELF, PUB, {"trades": [{"qty": 1000, "price_tl": 12.5}]})
    assert h.avg_price == D("12.5") and h.net_value_try == D(12_500)
    assert insider_features([priced], SELF, PUB, None).net_value_try is None  # no price anywhere → unknown


def test_cluster_counts_distinct_positive_holders() -> None:
    assert cluster([]) == 0


QUARTER_ENDS = [date(y, m, 30 if m in (6, 9) else 31) for y in range(2023, 2027) for m in (3, 6, 9, 12)]


def quarters(values: list[float], item: str = "operating_profit_q") -> list[FundamentalRow]:
    return [FundamentalRow(d, item, D(str(v)), True) for d, v in zip(QUARTER_ENDS, values, strict=False)]


def test_e4_sue_and_cfo_quality() -> None:
    # 12 quarters: Δcore = core_q − core_(q−4) over the last 8 = [10, -5, 0, 5, 10, -5, 0, 25]
    ops = [100, 100, 100, 100, 110, 95, 100, 105, 120, 90, 100, 130]
    rows = quarters(ops)
    deltas = [10.0, -5.0, 0.0, 5.0, 10.0, -5.0, 0.0, 25.0]
    mean = sum(deltas) / 8
    sd = (sum((x - mean) ** 2 for x in deltas) / 7) ** 0.5
    assert sue(rows) == round(25.0 / sd, 4)
    assert sue(quarters(ops[:9])) is None  # only 5 year-over-year changes
    assert sue(quarters([100] * 12)) is None  # no variation → no surprise measure
    assert sue([]) is None
    last = date(2025, 12, 31)
    cfo = [FundamentalRow(last, "cfo_ttm", D(90), True), FundamentalRow(last, "net_income_ttm", D(100), True)]
    assert cfo_quality(cfo) == 0.9
    neg = [FundamentalRow(last, "cfo_ttm", D(5), True), FundamentalRow(last, "net_income_ttm", D(-10), True)]
    assert cfo_quality(neg) == "iyi"
    assert cfo_quality([neg[1], FundamentalRow(last, "cfo_ttm", D(-1), True)]) == "zayıf"
    assert cfo_quality(rows) == "unknown"
    doc = e4_features(rows + cfo)
    assert doc["e4_sue"] == sue(rows) and doc["e4_cfo_quality"] == 0.9 and doc["e4_data"] == "fundamentals_pit"
    assert doc["e4_tms29"] is True


def test_e4_without_the_table_is_unknown() -> None:
    assert e4_features(None) == {"e4_sue": None, "e4_cfo_quality": "unknown", "e4_tms29": None, "e4_data": "unknown"}
    assert live_features(MergeInputs(), event_type="E4", ticker=T, disclosure_index=SELF, published_at=PUB,
                         available_at=PUB, reader=None, paid_in_capital=None, free_float_mcap=None) == {
        "e4": e4_features(None)}  # fmt: skip


def test_live_features_shapes() -> None:
    kw: dict[str, Any] = {"ticker": T, "disclosure_index": SELF, "published_at": PUB, "available_at": PUB}
    one = MergeInputs((buyback(SELF, PUB, [("2026-10-14", "1250000")]),))
    e1 = live_features(
        one, event_type="E1", reader={"nature": "execution"}, paid_in_capital=D(500_000_000), free_float_mcap=None, **kw
    )
    assert e1 == {
        "e1_nature": "execution",
        "new_buyback_rows": 1,
        "buyback_10d_capital_pct": 0.0025,
        "buyback_10d_notice_count": 1,
        "buyback_sale_within_20d": False,
    }
    me = insider(SELF, PUB, [("2026-10-14", "50000", "0", "1", "50001")], price_low_try="40", price_high_try="40")
    e2 = live_features(MergeInputs((me,)), event_type="E2", reader={"role": "board_member", "open_market": True},
                       paid_in_capital=None, free_float_mcap=D(2_000_000_000), **kw)  # fmt: skip
    assert e2["insider_net_buy_value_try"] == 2_000_000 and e2["insider_buy_to_ff_mcap"] == 0.001
    assert e2["insider_cluster_30d"] == 1 and e2["insider_role_class"] == "board_member"
    assert live_features(MergeInputs(), event_type="E3", reader=None, paid_in_capital=None, free_float_mcap=None,
                         **kw) == {}  # fmt: skip


def test_e3_amount_in_tl_and_fx_text_amounts() -> None:
    usd = MergeInputs(currency="USD", fx_rate=D("41.8123"))
    assert amount_try(usd, {"amount_try_stated": None}, D(12_000_000)) == D("501747600.0000")
    assert amount_try(usd, {"amount_try_stated": 500_000_000}, D(12_000_000)) == D(500_000_000)
    assert amount_try(MergeInputs(currency="USD"), {}, D(12_000_000)) is None  # no rate → unknown, not guessed
    assert amount_try(MergeInputs(currency="TRY"), {}, D(7)) == D(7) and amount_try(MergeInputs(), {}, D(7)) == D(7)
    text = "12.000.000 USD tutarında; ayrıca $ 1.500.000,50 ve 3.000.000 ABD Doları; 9.000.000 TL"
    assert fx_text_amounts(text, "USD") == [D(12_000_000), D(3_000_000), D("1500000.50")]
    assert fx_text_amounts("2.000.000 Avro ve € 750.000", "EUR") == [D(2_000_000), D(750_000)]
    assert fx_text_amounts(text, "TRY") == [] and fx_text_amounts(text, None) == []
    assert limits_of(D("47.40")) == (42.66, 52.1)
