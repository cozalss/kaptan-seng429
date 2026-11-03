"""The one market calendar of the rules: trading days and R15 expiry (#32).

Every date comes from the BIST calendar (`kaptan.prices.calendar`: bayrams, national holidays, special
closures). A date outside the calendar's years counts its weekdays.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Final

from kaptan.prices import calendar as bist

ISTANBUL: Final = timedelta(hours=3)  # no DST since 2016


def is_trading_day(d: date) -> bool:
    try:
        return bist.is_trading_day(d)
    except bist.CalendarRangeError:
        return d.weekday() < 5


def next_trading_day(d: date) -> date:
    d += timedelta(days=1)
    while not is_trading_day(d):
        d += timedelta(days=1)
    return d


def approval_expiry(created_at: datetime) -> datetime:
    """R15: an approval lapses at 09:50 Istanbul of the next session after it was requested."""
    local_day = (created_at.astimezone(UTC) + ISTANBUL).date()
    expiry_day = next_trading_day(local_day)
    return datetime(expiry_day.year, expiry_day.month, expiry_day.day, 9, 50, tzinfo=UTC) - ISTANBUL
