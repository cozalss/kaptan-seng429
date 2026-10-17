"""The API's notion of "now".

Outside DEMO_MODE it is the wall clock (UTC). In DEMO_MODE it is the panel mock's demo clock
(kaptan-panel/src/mocks/clock.ts): the demo day is Monday 11 January 2027 and "now" starts at
13:40 Istanbul (10:40Z) at the moment the demo was seeded/reset, then advances in real time.
The seed/reset writes that moment to `ops.demo_state.started_at`; the app loads it at startup.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Final

DEMO_DAY: Final = date(2027, 1, 11)
#: 13:40 Istanbul = 10:40Z on the demo day.
DEMO_ANCHOR: Final = datetime(2027, 1, 11, 10, 40, tzinfo=UTC)
ISTANBUL_OFFSET: Final = timedelta(hours=3)  # no DST since 2016


def wall_now() -> datetime:
    return datetime.now(UTC)


@dataclass(slots=True)
class Clock:
    """`now()` = anchor + (real now − started_at) when demo, else the real now."""

    demo: bool
    anchor: datetime = DEMO_ANCHOR
    started_at: datetime | None = None
    real_now: Callable[[], datetime] = field(default=wall_now)

    def now(self) -> datetime:
        real = self.real_now()
        if not self.demo:
            return real
        started = self.started_at or real
        return self.anchor + max(timedelta(0), real - started)

    def restart(self, started_at: datetime | None = None) -> datetime:
        """Demo reset: the clock jumps back to the anchor."""
        self.started_at = started_at or self.real_now()
        return self.started_at


def istanbul_date(at: datetime) -> date:
    """Calendar day in Istanbul (UTC+3) — the panel's istDay()."""
    return (at.astimezone(UTC) + ISTANBUL_OFFSET).date()
