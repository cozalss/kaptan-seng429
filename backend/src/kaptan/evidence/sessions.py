"""Session arithmetic of the event study (06 §12.2) and the point-in-time cut (07 P1).

All functions are pure and use the BIST calendar of `kaptan.prices.calendar`.
"""

from __future__ import annotations

from datetime import date, datetime

from kaptan.evidence.params import EARLY_CUTOFF, LATE_CUTOFF
from kaptan.prices.calendar import IST, close_known_at, is_trading_day, next_session, prev_session


def _local(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        raise ValueError("timestamp must be timezone-aware")
    return ts.astimezone(IST)


def event_session(published_at: datetime) -> date:
    """The session the news belongs to: its own day up to 18:10, else the next session (06 §12.2)."""
    local = _local(published_at)
    d = local.date()
    if is_trading_day(d) and local.time() <= LATE_CUTOFF:
        return d
    return next_session(d)


def entry_session(published_at: datetime) -> date:
    """t0, the session whose open is the first tradable price (P5): the same session only before 09:40."""
    local = _local(published_at)
    d = local.date()
    if is_trading_day(d) and local.time() < EARLY_CUTOFF:
        return d
    return next_session(d)


def last_known_session(as_of: datetime) -> date:
    """The latest session whose (delayed) close was final strictly before `as_of`."""
    d = _local(as_of).date()
    if is_trading_day(d) and close_known_at(d) < as_of:
        return d
    return prev_session(d)
