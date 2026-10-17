"""BIST session calendar, checked against nine years of real XU100 sessions (recorded fixture)."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

import pytest

from kaptan.prices import calendar as cal
from tests.fixtures.prices.cassette import load_sessions

#: Yahoo zero-volume rows on days BIST did trade (Christmas, Good Friday: ICE feed artefacts).
YAHOO_ARTEFACTS = {date(y, 12, 25) for y in range(2018, 2026)} | {date(2019, 4, 19), date(2021, 4, 2)}


def test_calendar_matches_nine_years_of_xu100_sessions() -> None:
    data = load_sessions()
    sessions = {date.fromisoformat(d) for d in data["sessions"]}
    first, last = date(2018, 1, 2), date(2026, 10, 15)  # the recording ends before 16 Oct
    mismatches = []
    d = first
    while d <= last:
        if d.weekday() < 5 and d not in YAHOO_ARTEFACTS and (d in sessions) != cal.is_trading_day(d):
            mismatches.append(d)
        d += timedelta(days=1)
    assert mismatches == []
    assert len(sessions) > 2100


@pytest.mark.parametrize(
    ("d", "trading"),
    [
        (date(2026, 10, 29), False),  # Cumhuriyet Bayramı
        (date(2026, 10, 28), True),  # half day
        (date(2027, 3, 9), False),  # Ramazan Bayramı 2027
        (date(2027, 5, 19), False),
        (date(2023, 2, 10), False),  # earthquake closure
        (date(2026, 10, 17), False),  # Saturday
        (date(2026, 10, 16), True),
    ],
)
def test_known_days(d: date, trading: bool) -> None:
    assert cal.is_trading_day(d) is trading


def test_half_days_and_session_times() -> None:
    assert cal.is_half_day(date(2026, 5, 26))  # Kurban arifesi
    assert cal.is_half_day(date(2026, 10, 28))
    assert not cal.is_half_day(date(2026, 10, 27))
    assert not cal.is_half_day(date(2016, 10, 28))  # outside the table: never a half day, no error
    assert cal.session_close(date(2026, 10, 28)).time() == time(12, 30)
    assert cal.session_close(date(2026, 10, 27)).time() == time(18, 10)
    assert cal.close_known_at(date(2026, 10, 28)).time() == time(13, 0)
    assert cal.close_known_at(date(2026, 10, 27)).utcoffset() == timedelta(hours=3)
    assert cal.open_known_at(date(2026, 10, 27)).time() == time(10, 15)


def test_session_arithmetic() -> None:
    assert cal.next_session(date(2026, 10, 28)) == date(2026, 10, 30)  # skips 29 Oct
    assert cal.prev_session(date(2026, 7, 16)) == date(2026, 7, 14)  # skips 15 July
    assert cal.add_sessions(date(2026, 5, 25), 2) == date(2026, 6, 1)  # Kurban 27–29 May + weekend
    assert cal.add_sessions(date(2026, 6, 1), -2) == date(2026, 5, 25)
    assert cal.add_sessions(date(2026, 6, 1), 0) == date(2026, 6, 1)
    assert cal.sessions_between(date(2026, 7, 13), date(2026, 7, 19)) == [
        date(2026, 7, 13),
        date(2026, 7, 14),
        date(2026, 7, 16),
        date(2026, 7, 17),
    ]


def test_range_and_timezone_guards() -> None:
    with pytest.raises(cal.CalendarRangeError):
        cal.is_trading_day(date(2017, 12, 29))
    with pytest.raises(cal.CalendarRangeError):
        cal.next_session(date(2027, 12, 31))
    with pytest.raises(ValueError, match="timezone-aware"):
        cal.istanbul_date(datetime(2026, 10, 1, 22, 0))
    assert cal.istanbul_date(datetime(2026, 10, 1, 22, 0, tzinfo=UTC)) == date(2026, 10, 2)
