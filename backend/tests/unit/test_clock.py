"""The fixture clock moves when a test moves it."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from tests.harness.clock import FIXTURE_ANCHOR as DEMO_ANCHOR
from tests.harness.clock import FixedDayClock as Clock

REAL = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)


def test_advance_moves_the_demo_clock_only() -> None:
    demo = Clock(started_at=REAL, real_now=lambda: REAL)
    assert demo.now() == DEMO_ANCHOR
    assert demo.advance(timedelta(minutes=1)) == DEMO_ANCHOR + timedelta(minutes=1)
    assert demo.now() == DEMO_ANCHOR + timedelta(minutes=1)
    fresh = Clock(real_now=lambda: REAL)
    assert fresh.advance(timedelta(minutes=2)) == DEMO_ANCHOR + timedelta(minutes=2)
