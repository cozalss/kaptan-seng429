"""08 §3.5 statistical tests with hand-checked values."""

from __future__ import annotations

import csv
import math
from pathlib import Path

import pytest

from kaptan.evidence.inference import (
    _ranks,
    append_trial,
    benjamini_hochberg,
    bmp_kp_t,
    corrado_rank,
    deflated_sharpe,
    holm,
    sharpe,
    stationary_bootstrap_sharpe_ci,
    two_sided_p,
)


def test_two_sided_p() -> None:
    assert two_sided_p(1.959964) == pytest.approx(0.05, abs=1e-5)
    assert two_sided_p(0.0) == 1.0


def test_bmp_and_the_kolari_pynnonen_correction() -> None:
    scars = [1.0, 2.0, 3.0, 4.0]
    plain = bmp_kp_t(scars)
    assert plain == pytest.approx(2.5 * 2 / math.sqrt(5 / 3))
    corrected = bmp_kp_t(scars, 0.1)
    assert corrected == pytest.approx(plain * math.sqrt(0.9 / 1.3))
    assert corrected < plain
    with pytest.raises(ValueError, match="two events"):
        bmp_kp_t([1.0])
    with pytest.raises(ValueError, match="dispersion"):
        bmp_kp_t([1.0, 1.0])
    with pytest.raises(ValueError, match="too negative"):
        bmp_kp_t([1.0, 2.0, 3.0], -0.9)


def test_ranks_average_ties() -> None:
    assert _ranks([3.0, 1.0, 3.0, 2.0]) == [3.5, 1.0, 3.5, 2.0]


def test_corrado_rank_detects_an_event_day_outlier() -> None:
    base = [0.001, -0.002, 0.0005, -0.001, 0.002, -0.0005, 0.0015, -0.0015, 0.0]
    firms = [[*base[i:], *base[:i], 0.05] for i in range(5)]  # the last day is the event: rank L for all
    t = corrado_rank(firms, len(firms[0]) - 1)
    assert t > 1.5
    assert corrado_rank(firms, 0) < t
    with pytest.raises(ValueError, match="no firms"):
        corrado_rank([], 0)
    with pytest.raises(ValueError, match="same length"):
        corrado_rank([[0.1, 0.2, 0.3], [0.1, 0.2]], 0)
    with pytest.raises(ValueError, match="dispersion"):
        corrado_rank([[1.0, 1.0, 1.0]], 0)


def test_holm_and_bh() -> None:
    p = [0.01, 0.04, 0.03, 0.005]
    assert holm(p) == pytest.approx([0.03, 0.06, 0.06, 0.02])
    assert benjamini_hochberg(p) == pytest.approx([0.02, 0.04, 0.04, 0.02])
    assert holm([0.9, 0.8]) == [1.0, 1.0]
    assert holm([]) == [] and benjamini_hochberg([]) == []


def test_sharpe_and_the_block_bootstrap_ci() -> None:
    rets = [0.01 if i % 3 else -0.005 for i in range(120)]
    point = sharpe(rets)
    lo, hi = stationary_bootstrap_sharpe_ci(rets, n=400)
    assert lo <= point <= hi
    assert (lo, hi) == stationary_bootstrap_sharpe_ci(rets, n=400)  # seeded
    assert sharpe([0.01, 0.01]) == 0.0
    with pytest.raises(ValueError):
        sharpe([0.1])
    with pytest.raises(ValueError):
        stationary_bootstrap_sharpe_ci([0.1])


def test_deflated_sharpe() -> None:
    one = deflated_sharpe(0.1, n_obs=252, n_trials=1, var_trials_sr=0.0)
    assert one == pytest.approx(NormalCdf(0.1 * math.sqrt(251) / math.sqrt(1 + 0.5 * 0.01)), abs=1e-9)
    many = deflated_sharpe(0.1, n_obs=252, n_trials=50, var_trials_sr=0.002)
    assert many < one  # more trials, higher bar
    with pytest.raises(ValueError, match="n_obs"):
        deflated_sharpe(0.1, n_obs=1, n_trials=1, var_trials_sr=0.0)
    with pytest.raises(ValueError, match="non-positive"):
        deflated_sharpe(2.0, n_obs=10, n_trials=1, var_trials_sr=0.0, skew=5.0)


def NormalCdf(x: float) -> float:  # noqa: N802 - mirrors the formula's Φ
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def test_trial_log(tmp_path: Path) -> None:
    path = tmp_path / "evals" / "trial_log.csv"
    row = {"at": "2026-10-30", "variant": "E3-v1", "params": "k=1", "metric": "car_5", "value": 0.012, "n": 41}
    append_trial(path, row)
    append_trial(path, {**row, "variant": "E3-v2"})
    with path.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    assert [r["variant"] for r in rows] == ["E3-v1", "E3-v2"]
    with pytest.raises(ValueError, match="misses"):
        append_trial(path, {"at": "x"})
