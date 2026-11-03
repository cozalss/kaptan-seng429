"""One market calendar (#32): the BIST calendar, weekdays outside its years."""

from __future__ import annotations

from datetime import UTC, date, datetime

from kaptan.portfolio import marks
from kaptan.rules import calendar as cal


def test_the_bist_calendar_decides() -> None:
    assert not cal.is_trading_day(date(2026, 5, 27))  # Kurban Bayramı
    assert not marks.is_trading_day(date(2026, 7, 15))
    assert cal.next_trading_day(date(2026, 5, 26)) == date(2026, 6, 1)
    # R15: requested on arife → lapses 09:50 of the first session after the bayram.
    expiry = cal.approval_expiry(datetime(2026, 5, 26, 9, 0, tzinfo=UTC))
    assert expiry == datetime(2026, 6, 1, 6, 50, tzinfo=UTC)
    assert marks.add_sessions(date(2026, 5, 26), 1) == date(2026, 6, 1)
    assert marks.next_trading_day(date(2026, 5, 26)) == date(2026, 6, 1)


def test_national_holidays_and_new_year() -> None:
    assert cal.next_trading_day(date(2026, 10, 28)) == date(2026, 10, 30)
    assert cal.next_trading_day(date(2026, 12, 31)) == date(2027, 1, 4)
    assert marks.add_sessions(date(2027, 1, 11), 5) == date(2027, 1, 18)
    assert cal.approval_expiry(datetime(2027, 1, 11, 11, 0, tzinfo=UTC)) == datetime(2027, 1, 12, 6, 50, tzinfo=UTC)


def test_outside_the_bist_years_weekdays_count() -> None:
    assert cal.is_trading_day(date(2030, 1, 2))
    assert not cal.is_trading_day(date(2030, 1, 5))
