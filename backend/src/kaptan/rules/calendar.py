"""Istanbul market calendar for the rules (the panel's lib/time.ts): trading days and R15 expiry."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Final

ISTANBUL: Final = timedelta(hours=3)  # no DST since 2016
HOLIDAYS: Final = frozenset({date(2026, 10, 29), date(2027, 1, 1)})


def is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and d not in HOLIDAYS


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
