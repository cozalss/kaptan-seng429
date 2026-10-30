"""Clock.advance: a simulated market minute on the demo clock (the loss simulation's steps)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from kaptan.clock import DEMO_ANCHOR, Clock

REAL = datetime(2026, 10, 30, 12, 0, tzinfo=UTC)


def test_advance_moves_the_demo_clock_only() -> None:
    demo = Clock(demo=True, started_at=REAL, real_now=lambda: REAL)
    assert demo.now() == DEMO_ANCHOR
    assert demo.advance(timedelta(minutes=1)) == DEMO_ANCHOR + timedelta(minutes=1)
    assert demo.now() == DEMO_ANCHOR + timedelta(minutes=1)
    fresh = Clock(demo=True, real_now=lambda: REAL)
    assert fresh.advance(timedelta(minutes=2)) == DEMO_ANCHOR + timedelta(minutes=2)
    wall = Clock(demo=False, real_now=lambda: REAL)
    assert wall.advance(timedelta(minutes=1)) == REAL
