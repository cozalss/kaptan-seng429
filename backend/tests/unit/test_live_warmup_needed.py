"""When a restart re-runs the warm-up: first install or missed market days, never on a plain restart."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from kaptan.live import warmup as w
from kaptan.prices.calendar import IST

#: A Wednesday afternoon: the last closed session (with 3 h of grace for the EOD job) is Tuesday.
NOW = datetime(2026, 11, 4, 15, 0, tzinfo=IST)
TUESDAY = date(2026, 11, 3)
LAST_WEEK = date(2026, 10, 27)
LONG_AGO = NOW - timedelta(days=3)


def test_first_install_needs_it() -> None:
    assert w.warmup_reason(NOW, last_attempt=None, has_universe=False, latest_bar=None) == "first"


def test_a_plain_restart_with_fresh_prices_skips_it() -> None:
    assert w.warmup_reason(NOW, last_attempt=LONG_AGO, has_universe=True, latest_bar=TUESDAY) is None


def test_a_database_from_before_the_marker_counts_as_warmed_up() -> None:
    assert w.warmup_reason(NOW, last_attempt=None, has_universe=True, latest_bar=TUESDAY) is None


def test_missed_market_days_run_it_again() -> None:
    assert w.warmup_reason(NOW, last_attempt=LONG_AGO, has_universe=True, latest_bar=LAST_WEEK) == "missed_sessions"


def test_the_eod_job_gets_its_grace_right_after_the_close() -> None:
    """19:00: today's bars are known since 18:30, but the EOD job may still be running."""
    evening = datetime(2026, 11, 4, 19, 0, tzinfo=IST)
    assert w.warmup_reason(evening, last_attempt=LONG_AGO, has_universe=True, latest_bar=TUESDAY) is None
    late = datetime(2026, 11, 4, 22, 0, tzinfo=IST)
    assert w.warmup_reason(late, last_attempt=LONG_AGO, has_universe=True, latest_bar=TUESDAY) == "missed_sessions"


def test_a_recent_attempt_waits_out_the_cooldown_so_failing_sources_are_not_hammered() -> None:
    recent = NOW - timedelta(hours=1)
    assert w.warmup_reason(NOW, last_attempt=recent, has_universe=False, latest_bar=None) is None
    assert w.warmup_reason(NOW, last_attempt=recent, has_universe=True, latest_bar=LAST_WEEK) is None
    past = NOW - w.WARMUP_COOLDOWN - timedelta(minutes=1)
    assert w.warmup_reason(NOW, last_attempt=past, has_universe=False, latest_bar=None) == "first"


def test_catch_up_days_cover_the_gap_within_the_limit() -> None:
    assert w.catch_up_days(5, NOW, None) == 5
    assert w.catch_up_days(5, NOW, TUESDAY) == 5
    assert w.catch_up_days(0, NOW, LAST_WEEK) == 8
    assert w.catch_up_days(5, NOW, date(2026, 1, 1)) == 30
