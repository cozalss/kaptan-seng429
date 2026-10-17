"""Borsa İstanbul equity session calendar (Europe/Istanbul), 2018–2027.

Closed: weekends, the fixed national holidays, Ramazan/Kurban Bayramı days and special closures.
Half days (arife, 28 October): the session ends at 12:30. The religious-holiday table was checked
against Yahoo's XU100 daily bars 2018-01-02 … 2026-10-16 (see tests/fixtures/prices/
xu100_sessions_2018_2026.json and test_prices_calendar.py); 2027 is from the official Diyanet dates.

Session times (continuous trading 10:00–18:00, closing auction until 18:10) are what SimBIST and
the point-in-time mark need; prices are 15 minutes delayed, so a session's open is known at 10:15
and its close is final by `EOD_AVAILABLE` (the 18:30 `eod_prices` job, 04-mimari §scheduler).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Final
from zoneinfo import ZoneInfo

IST: Final = ZoneInfo("Europe/Istanbul")
FIRST_YEAR: Final = 2018
LAST_YEAR: Final = 2027

SESSION_OPEN: Final = time(10, 0)
SESSION_CLOSE: Final = time(18, 10)  # closing auction included
HALF_DAY_CLOSE: Final = time(12, 30)
#: Quotes are 15 min delayed (Yahoo/İş Yatırım), so the open is known from 10:15.
OPEN_AVAILABLE: Final = time(10, 15)
HALF_DAY_EOD_AVAILABLE: Final = time(13, 0)
EOD_AVAILABLE: Final = time(18, 30)

#: Fixed national holidays (month, day). 15 July since 2017.
_FIXED: Final = ((1, 1), (4, 23), (5, 1), (5, 19), (7, 15), (8, 30), (10, 29))

#: First day of Ramazan Bayramı (3 days) and Kurban Bayramı (4 days); the day before is arife (half day).
_RAMAZAN: Final = {
    2018: date(2018, 6, 15),
    2019: date(2019, 6, 4),
    2020: date(2020, 5, 24),
    2021: date(2021, 5, 13),
    2022: date(2022, 5, 2),
    2023: date(2023, 4, 21),
    2024: date(2024, 4, 10),
    2025: date(2025, 3, 30),
    2026: date(2026, 3, 20),
    2027: date(2027, 3, 9),
}
_KURBAN: Final = {
    2018: date(2018, 8, 21),
    2019: date(2019, 8, 11),
    2020: date(2020, 7, 31),
    2021: date(2021, 7, 20),
    2022: date(2022, 7, 9),
    2023: date(2023, 6, 28),
    2024: date(2024, 6, 16),
    2025: date(2025, 6, 6),
    2026: date(2026, 5, 27),
    2027: date(2027, 5, 16),
}
#: Extraordinary closures: the 6 February 2023 earthquakes (market closed 8–14 February).
SPECIAL_CLOSURES: Final = frozenset(
    {date(2023, 2, 8), date(2023, 2, 9), date(2023, 2, 10), date(2023, 2, 13), date(2023, 2, 14)}
)


def _span(first: date, days: int) -> set[date]:
    return {first + timedelta(days=i) for i in range(days)}


def _build() -> tuple[frozenset[date], frozenset[date]]:
    closed: set[date] = set(SPECIAL_CLOSURES)
    half: set[date] = set()
    for year in range(FIRST_YEAR, LAST_YEAR + 1):
        closed |= {date(year, m, d) for m, d in _FIXED}
        half.add(date(year, 10, 28))
        closed |= _span(_RAMAZAN[year], 3) | _span(_KURBAN[year], 4)
        half |= {_RAMAZAN[year] - timedelta(days=1), _KURBAN[year] - timedelta(days=1)}
    return frozenset(closed), frozenset(half - closed)


HOLIDAYS, HALF_DAYS = _build()


class CalendarRangeError(ValueError):
    """A date outside the years this calendar knows."""


def _check(d: date) -> None:
    if not FIRST_YEAR <= d.year <= LAST_YEAR:
        raise CalendarRangeError(f"BIST calendar covers {FIRST_YEAR}–{LAST_YEAR}, got {d.isoformat()}")


def is_trading_day(d: date) -> bool:
    _check(d)
    return d.weekday() < 5 and d not in HOLIDAYS


def is_half_day(d: date) -> bool:
    """Arife / 28 October (only dates inside the calendar's years can be half days)."""
    return d in HALF_DAYS and is_trading_day(d)


def next_session(d: date) -> date:
    """The first trading day strictly after `d`."""
    nxt = d + timedelta(days=1)
    while not is_trading_day(nxt):
        nxt += timedelta(days=1)
    return nxt


def prev_session(d: date) -> date:
    """The last trading day strictly before `d`."""
    prv = d - timedelta(days=1)
    while not is_trading_day(prv):
        prv -= timedelta(days=1)
    return prv


def add_sessions(d: date, n: int) -> date:
    """Move `n` sessions forward (n > 0) or back (n < 0) from `d`; n = 0 returns `d` unchanged."""
    out = d
    step = next_session if n > 0 else prev_session
    for _ in range(abs(n)):
        out = step(out)
    return out


def sessions_between(start: date, end: date) -> list[date]:
    """Trading days in [start, end], ascending."""
    out: list[date] = []
    d = start
    while d <= end:
        if is_trading_day(d):
            out.append(d)
        d += timedelta(days=1)
    return out


def session_close(d: date) -> datetime:
    """The session's last trade time (aware, Europe/Istanbul)."""
    return datetime.combine(d, HALF_DAY_CLOSE if is_half_day(d) else SESSION_CLOSE, IST)


def open_known_at(d: date) -> datetime:
    return datetime.combine(d, OPEN_AVAILABLE, IST)


def close_known_at(d: date) -> datetime:
    """When the session's (delayed) close is final and the EOD job has stored it."""
    return datetime.combine(d, HALF_DAY_EOD_AVAILABLE if is_half_day(d) else EOD_AVAILABLE, IST)


def istanbul_date(ts: datetime) -> date:
    if ts.tzinfo is None:
        raise ValueError("timestamp must be timezone-aware")
    return ts.astimezone(IST).date()
