"""R10 regime detector (06 §9): the crisis_on legs and the 5-session hysteresis."""

from __future__ import annotations

import math
from datetime import date, timedelta

import pytest

from kaptan.risk.regime import RV_MIN_HISTORY, next_regime, percentile, rv_series, signal


def _series(prices: list[float]) -> list[tuple[date, float]]:
    start = date(2020, 1, 1)
    return [(start + timedelta(days=i), p) for i, p in enumerate(prices)]


def test_percentile_interpolates_like_numpy() -> None:
    assert percentile([1, 2, 3, 4, 5], 0.8) == pytest.approx(4.2)
    assert percentile([7], 0.8) == 7


def test_rv_series_is_annualised_stdev_of_log_returns() -> None:
    px = [100 * math.exp(0.01 * (i % 2)) for i in range(22)]  # alternating ±1 % log moves
    rvs = rv_series(px)
    assert len(rvs) == 2
    assert rvs[-1] == pytest.approx(math.sqrt(252) * 0.01 * math.sqrt(20 / 19) * 1.0, rel=1e-6)


def test_a_minus_five_percent_day_is_a_crisis_even_without_history() -> None:
    sig = signal(_series([100.0, 95.0]))
    assert sig.day_return == pytest.approx(-0.05)
    assert sig.crisis_raw and sig.sma50 is None and sig.rv20_p80 is None
    assert not signal(_series([100.0, 95.01])).crisis_raw


def test_trend_and_volatility_leg_needs_a_year_of_rv_history() -> None:
    calm = [100 * (1 + 0.001 * math.sin(i)) for i in range(RV_MIN_HISTORY + 40)]
    wild = [calm[-1]]
    for i in range(24):  # −3 % / +2.5 % swings: volatile, trending down, never a −5 % day
        wild.append(wild[-1] * (1.025 if i % 2 else 0.97))
    wild = wild[1:]
    sig = signal(_series(calm + wild))
    assert sig.sma50 is not None and sig.close < sig.sma50
    assert sig.rv20 is not None and sig.rv20_p80 is not None and sig.rv20 >= sig.rv20_p80
    assert sig.crisis_raw
    short = signal(_series((calm + wild)[-80:]))  # same shape, too little RV history
    assert short.rv20_p80 is None and not short.crisis_raw


def test_hysteresis_needs_five_calm_sessions_to_leave_a_crisis() -> None:
    regime, calm = next_regime("normal", 3, True)
    assert (regime, calm) == ("crisis", 0)
    for expected in (1, 2, 3, 4):
        regime, calm = next_regime(regime, calm, False)
        assert (regime, calm) == ("crisis", expected)
    assert next_regime(regime, calm, False) == ("normal", 5)
    assert next_regime("normal", 0, False) == ("normal", 1)


def test_signal_needs_closes() -> None:
    with pytest.raises(ValueError, match="no closes"):
        signal([])
