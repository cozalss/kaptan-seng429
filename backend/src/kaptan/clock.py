"""The API's notion of "now": always the wall clock (UTC)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Final

ISTANBUL_OFFSET: Final = timedelta(hours=3)  # no DST since 2016


def wall_now() -> datetime:
    return datetime.now(UTC)


@dataclass(slots=True)
class Clock:
    real_now: Callable[[], datetime] = field(default=wall_now)

    def now(self) -> datetime:
        return self.real_now()


def istanbul_date(at: datetime) -> date:
    """Calendar day in Istanbul (UTC+3) — the panel's istDay()."""
    return (at.astimezone(UTC) + ISTANBUL_OFFSET).date()
