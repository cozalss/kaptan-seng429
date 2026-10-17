"""İş Yatırım + Yahoo parsing and merging on the recorded responses (offline)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

import pytest

from kaptan.prices import isyatirim, yahoo
from kaptan.prices.http import SourceError
from kaptan.prices.ingest import fetch_ticker
from kaptan.prices.merge import with_raw_open
from kaptan.prices.models import InvalidTickerError, normalise_ticker
from tests.fixtures.prices.cassette import replay_client

THYAO = ("THYAO", date(2026, 7, 1), date(2026, 9, 30))
FROTO = ("FROTO", date(2025, 4, 1), date(2025, 6, 30))
TRKCM = ("TRKCM", date(2020, 1, 2), date(2020, 3, 31))
XU100 = ("XU100", date(2026, 7, 1), date(2026, 9, 30))


def test_normalise_ticker() -> None:
    assert normalise_ticker(" thyao.is ") == "THYAO"
    assert normalise_ticker("XU100") == "XU100"
    for bad in ("TH", "THY-AO", "THYAO;DROP", ""):
        with pytest.raises(InvalidTickerError):
            normalise_ticker(bad)


def test_chunks_cover_the_window_without_overlap() -> None:
    parts = isyatirim.chunks(date(2024, 1, 1), date(2025, 6, 30))
    assert parts == [(date(2024, 1, 1), date(2024, 12, 30)), (date(2024, 12, 31), date(2025, 6, 30))]
    assert isyatirim.chunks(date(2025, 1, 2), date(2025, 1, 1)) == []


def test_isyatirim_parse_rejects_error_payloads_and_skips_bad_rows() -> None:
    with pytest.raises(SourceError):
        isyatirim.parse_rows("THYAO", {"ok": False, "errorCode": "SYS0000"})
    with pytest.raises(SourceError):
        isyatirim.parse_rows("THYAO", [])
    rows: list[dict[str, Any]] = [
        {"HGDG_TARIH": "bad"},
        {"HGDG_TARIH": "02-09-2026", "HG_KAPANIS": None},
        {"HGDG_TARIH": "29-10-2026", "HG_KAPANIS": 300.0},  # holiday
        {"HGDG_TARIH": "28-10-2026", "HG_KAPANIS": 300.0, "HG_MAX": "x", "SERMAYE": True},
    ]
    bars = isyatirim.parse_rows("THYAO", {"ok": True, "value": rows})
    assert [(b.d, b.close, b.high, b.capital_try) for b in bars] == [(date(2026, 10, 28), Decimal("300.0"), None, None)]


async def test_thyao_raw_rows_and_scaled_open() -> None:
    async with replay_client() as client:
        fetched = await fetch_ticker(client, *THYAO)
    raw = {b.d: b for b in fetched.raw}
    sep1 = raw[date(2026, 9, 1)]
    assert (sep1.close, sep1.low, sep1.high) == (Decimal("301.5"), Decimal("300.0"), Decimal("305.5"))
    assert sep1.turnover_try == Decimal("10781512804.0")
    assert sep1.capital_try == Decimal("1.38E+9") and sep1.price_basis == "raw" and sep1.source == "isyatirim"
    assert date(2026, 7, 15) not in raw  # Demokrasi ve Milli Birlik Günü
    assert min(raw) == date(2026, 6, 30)  # one lead session for ex-date detection
    # Yahoo's open disagrees with İş Yatırım's range on 4 Aug 2026 → left empty, never invented.
    assert raw[date(2026, 8, 4)].open is None
    filled = [b for b in fetched.raw if b.open is not None]
    assert len(filled) == len(fetched.raw) - 2  # the lead day (no Yahoo row) and 4 Aug
    assert all(b.low * Decimal("0.995") <= b.open <= b.high * Decimal("1.005") for b in filled if b.low and b.high)  # type: ignore[operator]
    assert all(b.open_source == "yfinance_scaled" and b.volume for b in filled)
    assert fetched.actions == ()


async def test_froto_split_scales_the_open_back_to_raw_levels() -> None:
    async with replay_client() as client:
        fetched = await fetch_ticker(client, *FROTO)
    raw = {b.d: b for b in fetched.raw}
    before, after = raw[date(2025, 5, 6)], raw[date(2025, 5, 7)]
    assert before.close == Decimal("877.5") and after.close == Decimal("87.25")
    assert before.open is not None and Decimal(850) < before.open < Decimal(920)  # raw, not Yahoo's /10
    assert after.open is not None and Decimal(85) < after.open < Decimal(92)
    assert before.volume is not None and after.volume is not None
    assert before.volume < after.volume  # share counts: ×10 after a 10:1 bonus issue
    # The Kurban Bayramı days are neither in İş Yatırım nor in the stored Yahoo rows.
    days = {b.d for b in fetched.raw} | {b.d for b in fetched.adjusted}
    assert not days & {date(2025, 6, 6), date(2025, 6, 9)}


async def test_yahoo_rows_are_adjusted_like_yfinance_auto_adjust() -> None:
    async with replay_client() as client:
        series = await yahoo.fetch_chart(client, *FROTO)
    bars = yahoo.to_adjusted_bars(series)
    by_day = {b.d: b for b in bars}
    pre = by_day[date(2025, 4, 2)]
    assert pre.price_basis == "adjusted" and pre.source == "yfinance"
    assert pre.close < Decimal(100)  # split-adjusted (raw ~1 040)
    assert [s.factor for s in series.splits] == [Decimal("0.1")]
    assert [v.d for v in series.dividends] == [date(2025, 4, 3)]


async def test_delisted_ticker_only_on_isyatirim() -> None:
    async with replay_client() as client:
        fetched = await fetch_ticker(client, *TRKCM)
    assert len(fetched.raw) > 55 and fetched.adjusted == ()
    assert all(b.open is None for b in fetched.raw)


async def test_index_comes_from_yahoo_only() -> None:
    async with replay_client() as client:
        fetched = await fetch_ticker(client, *XU100)
    assert fetched.raw == () and len(fetched.adjusted) == 65
    assert fetched.action_window == (date(2026, 7, 1), date(2026, 9, 30))


def _chart(volumes: list[int | None], closes: list[float | None]) -> dict[str, Any]:
    n = len(volumes)
    stamps = [1780295400 + 86400 * i for i in range(n)]
    quote = {"open": closes, "high": closes, "low": closes, "close": closes, "volume": volumes}
    return {"chart": {"result": [{"timestamp": stamps, "indicators": {"quote": [quote], "adjclose": [{}]}}]}}


def test_yahoo_drops_zero_volume_and_null_rows() -> None:
    series = yahoo.parse_chart("THYAO", _chart([100, 0, None, 200], [10.0, 10.0, 11.0, None]))
    assert len(series.bars) == 1 and series.dropped_zero_volume == 2
    assert series.bars[0].adj_close == series.bars[0].close  # no adjclose block → close
    assert yahoo.parse_chart("THYAO", None).bars == ()
    assert yahoo.parse_chart("THYAO", {"chart": {"result": None}}).bars == ()
    with pytest.raises(SourceError):
        yahoo.parse_chart("THYAO", {"nope": 1})


def test_merge_without_yahoo_is_identity() -> None:
    assert with_raw_open([], None) == []
