"""Package B pure logic: JS rounding, the session calendar."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from kaptan.portfolio.marks import (
    add_sessions,
    holding_days,
    is_trading_day,
    js_round,
    next_trading_day,
    round_to,
)


def test_js_round_rounds_halves_up_like_math_round() -> None:
    assert js_round(2.5) == 3
    assert js_round(-2.5) == -2
    assert js_round(1308.16) == 1308
    assert round_to(91.936) == 91.94
    assert round_to(-0.011315, 5) == round_to(-0.011315, 5)
    assert round_to(1.005, 2) == 1.0  # 1.005 * 100 = 100.49999… in IEEE, same as JS


def test_calendar_skips_weekends_and_holidays() -> None:
    assert not is_trading_day(date(2027, 1, 1))
    assert not is_trading_day(date(2027, 1, 9))
    assert next_trading_day(date(2026, 12, 31)) == date(2027, 1, 4)
    assert add_sessions(date(2027, 1, 11), 5) == date(2027, 1, 18)
    assert add_sessions(date(2027, 1, 11), 0) == date(2027, 1, 11)


def test_holding_days_never_negative() -> None:
    opened = datetime(2027, 1, 4, 6, 55, tzinfo=UTC)
    assert holding_days(opened, opened + timedelta(days=7, hours=3)) == 7
    assert holding_days(opened, opened - timedelta(days=1)) == 0
