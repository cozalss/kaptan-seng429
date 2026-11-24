"""Who gets an instant message and who waits for the morning. Pure.

Instant = `Signal.important and Signal.mine` (normal). Less: only olumlu / olumsuz items of held stocks.
More: also watched items that are not important. Everything else important is in the morning message; the rest is
not sent at all. These settings pause messages only, never the app.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any, Final, Literal

from kaptan.alerts.prefs import in_quiet
from kaptan.telegram.format import SignalLike
from kaptan.text.turkish import IST

Tier = Literal["instant", "morning", "skip"]
GROUP_WINDOW: Final = timedelta(minutes=30)
SEND_GAP_S: Final = 1.1
MORNING_AT: Final = time(8, 45)
LEVEL_TR: Final = {"less": "Daha az", "normal": "Normal", "more": "Daha çok"}


def tier(sig: SignalLike, level: str) -> Tier:
    if not sig.important:
        return "instant" if level == "more" and sig.mine == "watched" else "skip"
    if level == "less":
        return "instant" if sig.mine == "held" and sig.tone in ("olumlu", "olumsuz") else "morning"
    return "instant" if sig.mine else "morning"


def day_bounds(now: datetime) -> tuple[datetime, datetime]:
    """The Istanbul day of `now` as two instants."""
    local = now.astimezone(IST)
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def next_morning(now: datetime) -> datetime:
    """The next 08:45 Istanbul after `now` (the end of /sessiz)."""
    local = now.astimezone(IST)
    at = datetime.combine(local.date(), MORNING_AT, IST)
    return at if at > local else at + timedelta(days=1)


def quiet_reason(state: dict[str, Any], prefs: dict[str, Any], now: datetime) -> str | None:
    """Why instant messages wait right now: the person's quiet hours or /sessiz (None: they may go)."""
    until = state.get("silent_until")
    if until is not None and now < until:
        return "quiet"
    return "quiet" if in_quiet(prefs["quiet"], now) else None
