"""The statistical tests of 08 §3.5 / 06 §12.4, pure Python (stdlib only):

- `bmp_kp_t`: Boehmer–Musumeci–Poulsen standardized cross-sectional t with the Kolari–Pynnönen
  correction for event-day clustering (mean pairwise correlation r̄ of the abnormal returns);
- `corrado_rank`: Corrado (1989) single-day rank test over equal-length estimation + event windows;
- `holm` / `benjamini_hochberg`: multiplicity-adjusted p-values (4 confirmatory tests / exploratory q);
- `stationary_bootstrap_sharpe_ci`: Politis–Romano stationary block bootstrap CI of the annualized
  Sharpe (mean block 10 days, percentile CI);
- `deflated_sharpe`: Bailey & López de Prado (2014) probability that the true Sharpe exceeds the
  expected maximum of `n_trials` unskilled variants;
- `append_trial`: the trial log (`evals/trial_log.csv`) every evaluated variant is written to.
"""

from __future__ import annotations

import csv
import math
import random
from collections.abc import Mapping, Sequence
from pathlib import Path
from statistics import NormalDist, fmean, stdev
from typing import Any, Final

_N: Final = NormalDist()
EULER_GAMMA: Final = 0.5772156649015329
TRADING_DAYS: Final = 252


def two_sided_p(z: float) -> float:
    """Two-sided p-value of a standard normal statistic."""
    return 2 * (1 - _N.cdf(abs(z)))


def bmp_kp_t(scars: Sequence[float], mean_correlation: float = 0.0) -> float:
    """BMP t of standardized CARs, × √((1 − r̄) / (1 + (n − 1) r̄)) (Kolari–Pynnönen)."""
    n = len(scars)
    if n < 2:
        raise ValueError("need at least two events")
    sd = stdev(scars)
    if sd == 0:
        raise ValueError("standardized CARs have no dispersion")
    t = fmean(scars) * math.sqrt(n) / sd
    denom = 1 + (n - 1) * mean_correlation
    if denom <= 0:
        raise ValueError("mean correlation too negative for n events")
    return t * math.sqrt((1 - mean_correlation) / denom)


def _ranks(values: Sequence[float]) -> list[float]:
    """1-based ranks, ties get their average rank."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def corrado_rank(abnormal: Sequence[Sequence[float]], event_index: int) -> float:
    """Corrado's T for day `event_index` of each firm's abnormal-return series (all of length L)."""
    if not abnormal:
        raise ValueError("no firms")
    length = len(abnormal[0])
    if length < 3 or any(len(s) != length for s in abnormal) or not 0 <= event_index < length:
        raise ValueError("every series needs the same length ≥ 3 and the event day inside it")
    mid = (length + 1) / 2
    ranks = [_ranks(s) for s in abnormal]
    n = len(ranks)
    daily = [sum(r[t] - mid for r in ranks) / n for t in range(length)]
    s_k = math.sqrt(sum(d * d for d in daily) / length)
    if s_k == 0:
        raise ValueError("ranks have no dispersion")
    return daily[event_index] / s_k


def holm(pvalues: Sequence[float]) -> list[float]:
    """Holm–Bonferroni step-down adjusted p-values, in the input order."""
    m = len(pvalues)
    order = sorted(range(m), key=lambda i: pvalues[i])
    out = [0.0] * m
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (m - rank) * pvalues[i]))
        out[i] = running
    return out


def benjamini_hochberg(pvalues: Sequence[float]) -> list[float]:
    """Benjamini–Hochberg q-values (step-up), in the input order."""
    m = len(pvalues)
    order = sorted(range(m), key=lambda i: pvalues[i], reverse=True)
    out = [0.0] * m
    running = 1.0
    for k, i in enumerate(order):
        rank = m - k
        running = min(running, pvalues[i] * m / rank)
        out[i] = min(1.0, running)
    return out


def sharpe(returns: Sequence[float], periods: int = TRADING_DAYS) -> float:
    if len(returns) < 2:
        raise ValueError("need at least two returns")
    sd = stdev(returns)
    return 0.0 if sd == 0 else fmean(returns) / sd * math.sqrt(periods)


def _stationary_sample(returns: Sequence[float], mean_block: float, rng: random.Random) -> list[float]:
    n, p = len(returns), 1 / mean_block
    out: list[float] = []
    i = rng.randrange(n)
    while len(out) < n:
        out.append(returns[i])
        i = rng.randrange(n) if rng.random() < p else (i + 1) % n
    return out


def stationary_bootstrap_sharpe_ci(
    returns: Sequence[float],
    *,
    mean_block: float = 10.0,
    n: int = 10_000,
    alpha: float = 0.05,
    seed: int = 429,
) -> tuple[float, float]:
    """Percentile CI of the annualized Sharpe under the stationary block bootstrap (Politis–Romano)."""
    if len(returns) < 2:
        raise ValueError("need at least two returns")
    rng = random.Random(seed)  # noqa: S311 - a reproducible resample, not a secret
    draws = sorted(sharpe(_stationary_sample(returns, mean_block, rng)) for _ in range(n))
    return draws[math.floor(alpha / 2 * (n - 1))], draws[math.ceil((1 - alpha / 2) * (n - 1))]


def deflated_sharpe(
    sr: float, *, n_obs: int, n_trials: int, var_trials_sr: float, skew: float = 0.0, kurtosis: float = 3.0
) -> float:
    """P(true SR > SR₀), SR₀ = the expected maximum Sharpe of `n_trials` unskilled variants (per-period SRs)."""
    if n_obs < 2 or n_trials < 1 or var_trials_sr < 0:
        raise ValueError("need n_obs ≥ 2, n_trials ≥ 1 and a non-negative variance")
    if n_trials == 1:
        sr0 = 0.0
    else:
        sr0 = math.sqrt(var_trials_sr) * (
            (1 - EULER_GAMMA) * _N.inv_cdf(1 - 1 / n_trials) + EULER_GAMMA * _N.inv_cdf(1 - 1 / (n_trials * math.e))
        )
    spread = 1 - skew * sr + (kurtosis - 1) / 4 * sr * sr
    if spread <= 0:
        raise ValueError("skew/kurtosis give a non-positive variance of the Sharpe estimate")
    return _N.cdf((sr - sr0) * math.sqrt(n_obs - 1) / math.sqrt(spread))


TRIAL_FIELDS: Final = ("at", "variant", "params", "metric", "value", "n")


def append_trial(path: Path, row: Mapping[str, Any]) -> None:
    """One evaluated variant per line (08 §3.5 step 1); the report counts the lines."""
    missing = [f for f in TRIAL_FIELDS if f not in row]
    if missing:
        raise ValueError(f"trial row misses {missing}")
    new = not path.exists()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=TRIAL_FIELDS, extrasaction="ignore")
        if new:
            writer.writeheader()
        writer.writerow(dict(row))
