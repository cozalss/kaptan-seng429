"""Cross-sectional statistics of CARs (06 §12.4): mean, median, t, hit rate, percentiles, CI."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from kaptan.evidence.params import Z95


@dataclass(frozen=True, slots=True)
class HorizonStats:
    horizon: int
    n: int
    mean: float
    median: float
    sd: float | None  # sample standard deviation (n − 1); None for n < 2
    t_stat: float | None  # mean / (sd / √n); None when sd is unknown or zero
    hit_rate: float  # share of CAR > 0
    p10: float
    p25: float
    p75: float
    p90: float
    ci95: tuple[float, float]  # mean ± z·sd/√n (n < 2: the mean itself)

    @property
    def iqr(self) -> float:
        return self.p75 - self.p25


def percentile(values: Sequence[float], q: float) -> float:
    """Linear interpolation between order statistics (numpy's default "linear" method)."""
    if not values:
        raise ValueError("percentile of an empty sample")
    if not 0.0 <= q <= 1.0:
        raise ValueError("q must be in [0, 1]")
    xs = sorted(values)
    pos = (len(xs) - 1) * q
    lo = math.floor(pos)
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


def summarize(horizon: int, values: Sequence[float]) -> HorizonStats:
    if not values:
        raise ValueError("no CARs to summarize")
    n = len(values)
    mean = math.fsum(values) / n
    sd: float | None = None
    t_stat: float | None = None
    ci = (mean, mean)
    if n >= 2:
        sd = math.sqrt(math.fsum((v - mean) ** 2 for v in values) / (n - 1))
        se = sd / math.sqrt(n)
        ci = (mean - Z95 * se, mean + Z95 * se)
        t_stat = mean / se if se > 0 else None
    return HorizonStats(
        horizon=horizon,
        n=n,
        mean=mean,
        median=percentile(values, 0.5),
        sd=sd,
        t_stat=t_stat,
        hit_rate=sum(1 for v in values if v > 0) / n,
        p10=percentile(values, 0.10),
        p25=percentile(values, 0.25),
        p75=percentile(values, 0.75),
        p90=percentile(values, 0.90),
        ci95=ci,
    )
