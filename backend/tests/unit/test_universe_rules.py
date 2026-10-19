"""U1–U8 rules, tick table, median turnover, İş Yatırım stock list and market-change parsing (offline)."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from kaptan.reference.profiles import affected_codes, parse_stock_list, target_market
from kaptan.reference.rules import UniverseInputs, evaluate, tick_size
from kaptan.reference.universe import median_turnover

FIX = Path(__file__).resolve().parents[1] / "fixtures" / "reference"


def _inputs(**kw: object) -> UniverseInputs:
    base: dict[str, object] = {
        "ticker": "THYAO",
        "price_try": Decimal(266),
        "adv20_median_try": Decimal(7_000_000_000),
        "mcap_try": Decimal(367_080_000_000),
        "ff_mcap_try": Decimal(180_000_000_000),
        "history_sessions": 2000,
        "market": None,
        "is_share": True,
    }
    return UniverseInputs(**{**base, **kw})  # type: ignore[arg-type]


def test_tick_table() -> None:
    assert tick_size(Decimal("19.99")) == Decimal("0.01")
    assert tick_size(Decimal(20)) == Decimal("0.02")
    assert tick_size(Decimal(266)) == Decimal("0.25")
    assert tick_size(Decimal(3000)) == Decimal("2.50")
    with pytest.raises(ValueError):
        tick_size(Decimal(0))


def test_eligible_and_each_rule_fails_alone() -> None:
    assert evaluate(_inputs()).eligible
    cases = {
        "U1": {"market": "yip"},
        "U2": {"adv20_median_try": Decimal(10_000_000)},
        "U3": {"ff_mcap_try": Decimal(50_000_000_000)},
        "U4": {"mcap_try": Decimal(2_000_000_000), "ff_mcap_try": Decimal(1_000_000_000)},
        "U5": {"history_sessions": 100},
        "U6": {"price_try": Decimal("2.50")},
        "U7": {"restricted_recently": ("vbts_brut_takas",)},
        "U8": {"is_share": False},
    }
    for code, kw in cases.items():
        v = evaluate(_inputs(**kw))
        assert code in v.reasons and not v.eligible, code
    unknown = evaluate(_inputs(adv20_median_try=None, market=None))
    assert unknown.reasons == ("U2",) and unknown.checks["U1"]["market"] == "unknown"


def test_median_turnover_pads_missing_sessions() -> None:
    assert median_turnover([Decimal(10)] * 20, 20) == 10
    assert median_turnover([Decimal(10)] * 9, 20) is None
    assert median_turnover([Decimal(10)] * 10, 20) == 5  # ten zeros + ten tens


def test_stock_list_and_market_parsing() -> None:
    profiles = parse_stock_list((FIX / "isyatirim_temel_degerler_trimmed.html").read_text(encoding="utf-8"))
    by = {p.ticker: p for p in profiles}
    assert by["THYAO"].sector == "Havayolları ve Hizm." and "TRALT" in by and len(by) == 6
    assert target_market("Payların Yakın İzleme Pazarına Alınması") == "yip"
    assert target_market("Payların Ana Pazardan Yıldız Pazara Alınması") == "yildiz"
    assert target_market("Genel Kurul") is None
    row = {"primary_ticker": None, "stock_codes": [], "related_stocks": ["RALYH", "bad code", "RALYH"]}
    assert affected_codes(row) == ["RALYH"]
