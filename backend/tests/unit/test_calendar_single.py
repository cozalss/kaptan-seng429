"""One market calendar (#32): BIST outside DEMO_MODE, the panel's list in DEMO_MODE (byte-identical demo)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest

from kaptan.portfolio import marks
from kaptan.rules import calendar as cal


def _mode(monkeypatch: pytest.MonkeyPatch, *, demo: bool) -> None:
    import kaptan.settings

    monkeypatch.setattr(kaptan.settings, "get_settings", lambda: SimpleNamespace(demo_mode=demo))


def test_live_mode_uses_the_bist_calendar(monkeypatch: pytest.MonkeyPatch) -> None:
    _mode(monkeypatch, demo=False)
    assert not cal.is_trading_day(date(2026, 5, 27))  # Kurban Bayramı
    assert not marks.is_trading_day(date(2026, 7, 15))
    assert cal.next_trading_day(date(2026, 5, 26)) == date(2026, 6, 1)
    # R15: requested on arife → lapses 09:50 of the first session after the bayram.
    expiry = cal.approval_expiry(datetime(2026, 5, 26, 9, 0, tzinfo=UTC))
    assert expiry == datetime(2026, 6, 1, 6, 50, tzinfo=UTC)
    assert marks.add_sessions(date(2026, 5, 26), 1) == date(2026, 6, 1)
    assert marks.next_trading_day(date(2026, 5, 26)) == date(2026, 6, 1)


def test_demo_mode_keeps_the_panel_list(monkeypatch: pytest.MonkeyPatch) -> None:
    _mode(monkeypatch, demo=True)
    assert cal.is_trading_day(date(2026, 5, 27))
    assert cal.next_trading_day(date(2026, 5, 26)) == date(2026, 5, 27)
    assert marks.add_sessions(date(2026, 5, 26), 1) == date(2026, 5, 27)


@pytest.mark.parametrize("demo", [True, False])
def test_the_demo_days_agree_in_both_modes(monkeypatch: pytest.MonkeyPatch, demo: bool) -> None:
    _mode(monkeypatch, demo=demo)
    assert cal.next_trading_day(date(2026, 10, 28)) == date(2026, 10, 30)
    assert cal.next_trading_day(date(2026, 12, 31)) == date(2027, 1, 4)
    assert marks.add_sessions(date(2027, 1, 11), 5) == date(2027, 1, 18)
    assert cal.approval_expiry(datetime(2027, 1, 11, 11, 0, tzinfo=UTC)) == datetime(2027, 1, 12, 6, 50, tzinfo=UTC)


def test_outside_the_bist_years_the_panel_list_is_the_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    _mode(monkeypatch, demo=False)
    assert cal.is_trading_day(date(2030, 1, 2))
    assert not cal.is_trading_day(date(2030, 1, 5))


def test_no_configuration_means_the_panel_list(monkeypatch: pytest.MonkeyPatch) -> None:
    import kaptan.settings

    def broken() -> None:
        raise kaptan.settings.ConfigError("invalid configuration")

    monkeypatch.setattr(kaptan.settings, "get_settings", broken)
    assert cal.panel_calendar() is True
    assert cal.is_trading_day(date(2026, 5, 27))
