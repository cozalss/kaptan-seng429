"""The one market calendar of the rules: trading days and R15 expiry (#32).

Outside DEMO_MODE every date comes from the BIST calendar (`kaptan.prices.calendar`: bayrams, national
holidays, special closures). In DEMO_MODE the panel's own short list (lib/time.ts HOLIDAYS) stays in
charge, so the demo day's expiry times, ticket TTLs and exit dates are byte-identical to the panel
mock. A date outside the BIST calendar's years falls back to the panel list too.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Final

from kaptan.prices import calendar as bist

ISTANBUL: Final = timedelta(hours=3)  # no DST since 2016
#: The panel calendar's holidays (lib/time.ts HOLIDAYS): DEMO_MODE only.
HOLIDAYS: Final = frozenset({date(2026, 10, 29), date(2027, 1, 1)})


def panel_calendar() -> bool:
    """True when the panel's list decides (DEMO_MODE, or no usable configuration)."""
    from kaptan.settings import ConfigError, get_settings

    try:
        return bool(get_settings().demo_mode)
    except ConfigError:
        return True


def panel_is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and d not in HOLIDAYS


def is_trading_day(d: date) -> bool:
    if panel_calendar():
        return panel_is_trading_day(d)
    try:
        return bist.is_trading_day(d)
    except bist.CalendarRangeError:
        return panel_is_trading_day(d)


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
