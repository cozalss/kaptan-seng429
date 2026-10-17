"""Package B pure logic: JS rounding, the session calendar, replay marks, live equity, loss path, quota."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest

from kaptan.demo.fixtures import DemoFixtures
from kaptan.portfolio.marks import (
    add_sessions,
    holding_days,
    is_trading_day,
    js_round,
    mark_price,
    next_trading_day,
    round_to,
)
from kaptan.risk.equity import PAPER_EQUITY_TRY, live_equity
from kaptan.risk.loss_simulation import DAILY_HALT_PCT, KILL_DRAWDOWN_PCT, LOSS_DAILY
from kaptan.risk.status import quota_used

LAST = (1_016_480.0, 1_030_274.0)  # v1.1-fwd last close / peak in the fixture


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


def test_replay_marks() -> None:
    assert round_to(
        mark_price(book="paper", run_id="run-day-e1-tmsmk", issuer_price=88.4, disclosure_index=1651222)
    ) == (91.94)
    assert mark_price(book="paper", run_id="run-demo-e3-ornek", issuer_price=1.0, disclosure_index=0) == 48.51
    assert mark_price(book="personal", run_id="x", issuer_price=12.3, disclosure_index=5) == 12.3


def test_live_equity_matches_the_mock_at_the_anchor() -> None:
    expected = DemoFixtures().meta["live_equity_at_anchor"]
    live = live_equity(0.0021, LAST)
    assert (live.equity, live.peak, live.drawdown) == (expected["equity"], expected["peak"], expected["drawdown"])
    fallback = live_equity(0, None)
    assert fallback.equity == PAPER_EQUITY_TRY and fallback.drawdown == 0


def test_loss_path_halts_at_step_two_and_kills_at_the_end() -> None:
    first_halt = next(i for i, d in enumerate(LOSS_DAILY) if d <= DAILY_HALT_PCT)
    assert first_halt == 2
    dds = [live_equity(d, LAST).drawdown for d in LOSS_DAILY]
    assert [i for i, dd in enumerate(dds) if dd <= KILL_DRAWDOWN_PCT] == [5]


@pytest.mark.parametrize(
    ("used", "injected", "expected"),
    [(118, 0, 118), (118, 2, 126), (130, 1, 130)],  # E already counted → no double count
)
def test_quota_used(used: int, injected: int, expected: int) -> None:
    assert quota_used("Gemini Flash-Lite", used, 4, injected) == expected
    assert quota_used("unknown", 7, 1, 0) == 7
