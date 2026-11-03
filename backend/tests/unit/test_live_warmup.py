"""Pure parts of the live warm-up: the İş Yatırım stock table, candidate order and session arithmetic."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from kaptan.live import warmup as w
from kaptan.prices.calendar import IST

PAGE = (Path(__file__).resolve().parents[1] / "fixtures/reference/isyatirim_temel_degerler_trimmed.html").read_text(
    encoding="utf-8"
)


def test_parse_stock_table_reads_market_cap_and_free_float() -> None:
    rows = {r.ticker: r for r in w.parse_stock_table(PAGE)}
    thy = rows["THYAO"]
    assert thy.sector == "Havayolları ve Hizm." and thy.close == Decimal("266.00")
    assert thy.mcap_try == Decimal("367080.0") * 1_000_000 and thy.free_float_pct == Decimal("49.1")
    assert thy.ff_mcap_try == thy.mcap_try * Decimal("0.491")
    assert rows["ASELS"].name == "Aselsan"
    assert w.parse_stock_table("<html></html>") == []


def test_tr_number() -> None:
    assert w.tr_number("1.469.460,0") == Decimal("1469460.0")
    assert w.tr_number(" - ") is None and w.tr_number("") is None and w.tr_number("abc") is None


def row(t: str, mcap: str | None, ff: str | None) -> w.StockRow:
    return w.StockRow(t, t, "S", None, None if mcap is None else Decimal(mcap), None if ff is None else Decimal(ff))


def test_pick_candidates_floor_priority_then_size() -> None:
    rows = [
        row("BIG", "100000000000", "50"),
        row("MID", "10000000000", "50"),
        row("TINY", "1000000000", "50"),  # 0.5 bn free float: below U4
        row("NOFF", "100000000000", None),
        row("PRIO", "4000000000", "50"),
    ]
    assert w.pick_candidates(rows, {"PRIO", "TINY"}, limit=10) == ["PRIO", "BIG", "MID"]
    assert w.pick_candidates(rows, set(), limit=2) == ["BIG", "MID"]
    assert w.pick_candidates(rows, set(), limit=0) == []


@pytest.mark.parametrize(
    ("now", "trade", "closed"),
    [
        (datetime(2026, 10, 30, 14, 0, tzinfo=IST), date(2026, 10, 30), date(2026, 10, 28)),  # Fri in session
        (datetime(2026, 10, 30, 23, 0, tzinfo=IST), date(2026, 11, 2), date(2026, 10, 30)),  # Fri night
        (datetime(2026, 10, 31, 12, 0, tzinfo=IST), date(2026, 11, 2), date(2026, 10, 30)),  # Saturday
        (datetime(2026, 10, 29, 12, 0, tzinfo=IST), date(2026, 10, 30), date(2026, 10, 28)),  # 29 Ekim holiday
    ],
)
def test_universe_day_and_last_closed_session(now: datetime, trade: date, closed: date) -> None:
    assert w.universe_day(now) == trade
    assert w.last_closed_session(now) == closed


def test_recent_sessions() -> None:
    assert w.recent_sessions(date(2026, 10, 30), 3) == [date(2026, 10, 27), date(2026, 10, 28), date(2026, 10, 30)]
    assert w.recent_sessions(date(2026, 10, 30), 0) == []


def test_main_skips_without_kap_live(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    from kaptan.settings import get_settings

    patched = get_settings().model_copy(update={"kap_live": False})
    monkeypatch.setattr(w, "get_settings", lambda: patched)
    assert w.main([]) == 0
    assert "skipped" in capsys.readouterr().err


def test_main_reports_a_bad_configuration(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    from kaptan.settings import ConfigError

    def broken() -> None:
        raise ConfigError("invalid configuration: x")

    monkeypatch.setattr(w, "get_settings", broken)
    assert w.main(["--days", "3"]) == 2
    assert "invalid configuration" in capsys.readouterr().err
