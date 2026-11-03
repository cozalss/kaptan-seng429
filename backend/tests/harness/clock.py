"""The fixture day's clock: Monday 11 January 2027, "now" starts at 13:40 Istanbul when the day was seeded.

`kaptan.clock.Clock` is always the real time; a test hands this one to the app (tests/harness/app.py) so the recorded
day's expiries and day boundaries line up.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Final

from kaptan.clock import Clock, wall_now

FIXTURE_DAY: Final = date(2027, 1, 11)
#: 13:40 Istanbul = 10:40Z on the fixture day.
FIXTURE_ANCHOR: Final = datetime(2027, 1, 11, 10, 40, tzinfo=UTC)


@dataclass(slots=True)
class FixedDayClock(Clock):
    """`now()` = anchor + (real now − started_at)."""

    anchor: datetime = FIXTURE_ANCHOR
    started_at: datetime | None = None

    def now(self) -> datetime:
        real = self.real_now()
        started = self.started_at or real
        return self.anchor + max(timedelta(0), real - started)

    def advance(self, delta: timedelta) -> datetime:
        """Move "now" forward by `delta`; returns the new now."""
        self.started_at = (self.started_at or self.real_now()) - delta
        return self.now()

    def restart(self, started_at: datetime | None = None) -> datetime:
        """Back to the anchor (the day was seeded again)."""
        self.started_at = started_at or self.real_now()
        return self.started_at


__all__ = ["FIXTURE_ANCHOR", "FIXTURE_DAY", "FixedDayClock", "wall_now"]
