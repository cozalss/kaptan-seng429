"""kaptan.learn without a database: estimators and their walk-forward, the threshold guards, calibration, wording."""

from __future__ import annotations

import random
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from kaptan.evidence.stats import summarize
from kaptan.evidence.study import MARKET_ADJUSTED, EventResult, PastEvent, StudyResult
from kaptan.learn import estimators as est
from kaptan.learn import tuning
from kaptan.learn.calibration import MIN_MATURED, fit
from kaptan.learn.dataset import HoldoutLeakError, Sample, check_unsealed, round_trip, sealed_day
from kaptan.learn.tunables import BY_KEY, TUNABLES
from kaptan.learn.weekly import change_sentence
from kaptan.prices.calendar import IST
from kaptan.rules.format import ablative, accusative, dative
from kaptan.sizing.edge import shrunk_edge
from kaptan.sizing.params import DEFAULT_SIZING


def _at(y: int, m: int, d: int) -> datetime:
    return datetime(y, m, d, 11, 0, tzinfo=IST)


# ── estimators ───────────────────────────────────────────────────────────────


def test_robust_estimators_ignore_a_few_outliers_the_mean_follows() -> None:
    xs = [-0.004] * 18 + [0.6, 0.5]  # two runaway stocks
    assert est.mean(xs) > 0.05
    for name in ("median", "trim10", "trim20", "huber"):
        assert abs(est.ESTIMATORS[name](xs) - -0.004) < 0.01, name
    xs10 = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 100.0]
    assert est.winsorised(xs10, 0.1) == pytest.approx((2 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 9) / 10)


def test_shrinkage_moves_a_small_firm_toward_the_type() -> None:
    assert est.shrunk([], 0.01, est.mean) == 0.01
    assert est.shrunk([0.05] * 20, 0.01, est.mean) == pytest.approx(0.5 * 0.05 + 0.5 * 0.01)


def _obs(kind: str, year: int, n: int, centre: float, seed: int, outliers: bool = True) -> list[est.Obs]:
    rng = random.Random(seed)  # noqa: S311 - reproducible synthetic data
    out = []
    for i in range(n):
        x = centre + rng.gauss(0, 0.03)
        if outliers and i % 25 == 0:
            x += 0.8  # a runaway stock now and then
        out.append(est.Obs(kind, f"T{i % 40}", _at(year, 1 + i % 11, 1 + i % 27), x))
    return out


def test_walk_forward_trains_only_on_windows_closed_before_the_check_year() -> None:
    # 2022 had a few runaway stocks, 2023 had none: the robust centre predicts 2023 better than the mean
    obs = [*_obs("E3", 2022, 200, -0.01, 1), *_obs("E3", 2023, 200, -0.01, 2, outliers=False)]
    obs += _obs("E3", 2024, 50, -0.01, 3)
    late = est.Obs("E3", "LATE", datetime(2022, 12, 28, 11, 0, tzinfo=IST), 9.9)  # its 5 days end in 2023
    train, val = est.fold_sets([*obs, late], "E3", date(2023, 1, 1), date(2024, 1, 1))
    assert late not in train and all(o.published_at.year == 2022 for o in train)
    assert {o.published_at.year for o in val} == {2023}
    folds = {(f.kind, f.fold): f for f in est.walk_forward(obs)}
    assert folds[("E3", "2022 → 2023")].n_train == 200 and folds[("E3", "2022–23 → 2024")].n_val == 50
    assert folds[("E1", "2022 → 2023")].error_ratio is None  # no events: said, not guessed
    assert folds[("E3", "2022 → 2023")].error_ratio is not None and folds[("E3", "2022 → 2023")].error_ratio < 1


def test_the_estimator_is_chosen_on_the_first_fold_only() -> None:
    obs = [*_obs("E3", 2022, 300, -0.01, 4), *_obs("E3", 2023, 300, -0.01, 5, outliers=False)]
    chosen = est.choose(obs, ("E3",))
    assert chosen != "mean"
    # a 2024 full of runaway stocks favours the mean on the check fold; it must not change the choice
    obs += [*_obs("E3", 2024, 300, -0.01, 6), *_obs("E3", 2024, 300, 0.2, 7)]
    assert est.pooled_ratio(obs, 1, ("E3",), chosen) is not None
    assert est.choose(obs, ("E3",)) == chosen
    assert est.CHOSEN == "median"


# ── the sizer reads the robust centre and the calibration factor ──────────────


def _study(cars: list[float]) -> StudyResult:
    results = tuple(
        EventResult(PastEvent(f"evt:kap:{i}", "AAA", "A", "t", _at(2024, 1, 1), _at(2024, 1, 1)), date(2024, 1, 2),
                    {1: c, 5: c, 20: c}, MARKET_ADJUSTED)
        for i, c in enumerate(cars)
    )  # fmt: skip
    return StudyResult((1, 5, 20), results, {h: summarize(h, cars) for h in (1, 5, 20)}, n_raw=len(cars))


def test_the_edge_uses_the_median_and_the_correction() -> None:
    skewed = _study([-0.004] * 9 + [0.5])  # mean +4.6 %, median −0.4 %
    edge = shrunk_edge("E1", skewed, None)
    assert edge is not None and edge.car_type == Decimal("-0.004") and edge.edge_adj == Decimal("-0.002")
    corrected = shrunk_edge("E1", skewed, None, correction=Decimal("1.5"))
    assert corrected is not None and corrected.edge_adj == Decimal("-0.003") and corrected.correction == Decimal("1.5")
    mean_params = type(DEFAULT_SIZING)(edge_location="mean")
    as_before = shrunk_edge("E1", skewed, None, mean_params)
    assert as_before is not None and as_before.car_type > 0


# ── threshold guards ─────────────────────────────────────────────────────────

LEAK = BY_KEY["leak_ret5d_max"]


def _sample(year: int, i: int, leak: float, car: float, source: str = "archive") -> Sample:
    published = datetime(year, 1, 2, 11, 0, tzinfo=IST) + timedelta(days=(i * 3) % 340)
    return Sample("E3", f"T{i}", published, car, 0.003, source, {"leak_5d": leak})


def _world(gain_in: tuple[int, ...], n: int = 120, noise: float = 0.002) -> list[Sample]:
    """Events with 7–8 % pre-run-up lose 3 % in the years `gain_in` (so a 7 % limit helps there), else win 3 %."""
    rng = random.Random(7)  # noqa: S311 - reproducible synthetic data
    out = []
    for year in (2022, 2023, 2024):
        for i in range(n):
            leak = 0.075 if i % 4 == 0 else 0.01
            base = (-0.03 if year in gain_in else 0.03) if leak > 0.07 else 0.01
            out.append(_sample(year, i, leak, base + rng.gauss(0, noise)))
    return out


def test_a_step_that_helps_in_every_year_is_adopted_with_its_range() -> None:
    v = tuning.best_step(LEAK, 0.08, _world((2022, 2023, 2024)))
    assert v.adopt and v.candidate == pytest.approx(0.07) and v.gain is not None and v.gain > tuning.MARGIN
    assert v.ci is not None and v.ci[0] > 0 and v.n >= tuning.MIN_N
    assert v.evidence["gain_bps"] is not None and v.evidence["gain_bps"] > 5


def test_a_step_the_earlier_years_did_not_support_is_rejected() -> None:
    v = tuning.judge(LEAK, 0.08, 0.07, _world((2023, 2024)))  # 2022 said the opposite
    assert not v.adopt and "Önceki yıllar" in v.reason_tr


def test_too_few_events_or_no_input_is_rejected_with_the_reason() -> None:
    small = tuning.judge(LEAK, 0.08, 0.07, _world((2022, 2023, 2024), n=12))
    assert not small.adopt and "en az 50" in small.reason_tr
    none = tuning.best_step(BY_KEY["e3_revenue_materiality_min"], 0.10, _world((2022,)))
    assert not none.adopt and none.candidate is None and "bilgi yok" in none.reason_tr


def test_a_gain_inside_the_noise_is_not_adopted() -> None:
    v = tuning.judge(LEAK, 0.08, 0.07, _world((2022, 2023, 2024), noise=0.6))
    assert not v.adopt


def test_candidates_are_one_grid_step_and_stay_in_range() -> None:
    for t in TUNABLES:
        grid = t.grid()
        assert grid[0] == pytest.approx(t.lo) and grid[-1] == pytest.approx(t.hi)
        for v in t.neighbours(t.lo):
            assert t.lo <= v <= t.hi and abs(v - t.lo) == pytest.approx(t.step)
    assert BY_KEY["e1_capital_10d_min"].neighbours(0.0025) == [0.002, 0.003]
    assert BY_KEY["e1_capital_10d_min"].neighbours(0.0010) == [0.0015]


# ── calibration ──────────────────────────────────────────────────────────────


def test_calibration_waits_for_thirty_and_is_bounded() -> None:
    few = fit("E1", [(100.0, 50.0)] * (MIN_MATURED - 1))
    assert few.slope == pytest.approx(0.5) and few.factor == 1.0 and not few.active
    enough = fit("E1", [(100.0, 50.0)] * MIN_MATURED)
    assert enough.active and enough.factor == pytest.approx(0.5) and enough.bias_bps == pytest.approx(-50)
    wild = fit("E1", [(10.0, 400.0)] * MIN_MATURED)
    assert wild.factor == 1.5  # never more than ×1.5
    assert fit("E2", []).n == 0 and fit("E2", []).factor == 1.0


# ── the seal and the cost ────────────────────────────────────────────────────


def test_a_sealed_time_raises_and_the_cost_has_its_floor() -> None:
    with pytest.raises(HoldoutLeakError):
        check_unsealed(datetime(2025, 6, 1, 12, 0, tzinfo=IST), "event")
    check_unsealed(datetime(2026, 11, 1, 0, 0, tzinfo=IST), "event")  # the first live day is open
    assert sealed_day(date(2026, 10, 31)) and not sealed_day(date(2024, 12, 31))
    assert round_trip(0.0) == pytest.approx(0.003)  # floored
    assert round_trip(0.02) > 0.02


# ── wording ──────────────────────────────────────────────────────────────────


def test_turkish_number_endings_follow_the_last_word() -> None:
    assert [accusative(x) for x in ("%8", "%12", "%10", "%6", "%4", "%20")] == [
        "%8'i", "%12'yi", "%10'u", "%6'yı", "%4'ü", "%20'yi",
    ]  # fmt: skip
    assert (ablative("%0,25"), dative("%0,2"), ablative("%8"), dative("%10")) == (
        "%0,25'ten",
        "%0,2'ye",
        "%8'den",
        "%10'a",
    )


def test_the_change_sentence_has_no_money_and_says_what_happened() -> None:
    t = BY_KEY["e1_capital_10d_min"]
    v = tuning.Verdict(t, 0.0025, 0.002, True, "", 0.0041, (0.0006, 0.0077), 80)
    assert change_sentence(t, v, True) == (
        "KAPtan bu hafta geri alım eşiğini %0,25'ten %0,2'ye indirdi; geçmiş testte karar başına net getiri "
        "+0,4 puan arttı."
    )
    assert "önerdi" in change_sentence(t, v, False) and "uygulamadım" in change_sentence(t, v, False)
    money = BY_KEY["e2_min_value_try"]
    line = change_sentence(money, tuning.Verdict(money, 1e6, 750_000.0, True, "", 0.001, (0.0002, 0.002), 60), True)
    assert "TL" not in line and "750" not in line and "düşürdü" in line
