"""Outlier-robust edge estimators and their walk-forward comparison (06 §8.2). Pure.

The sizer's edge was the mean CAR of the type, shrunk toward by the company's own mean (w = n_f / (n_f + 20)).
BIST event CARs have fat tails: one cut of E1 had mean +1.6 % but median −0.4 %, so a few outliers decided the sign.
Candidates: mean, median, 5/10/20 % trimmed means, 5/10 % winsorised means and Huber's M-estimator (c = 1.345, MAD
scale); each is used for both the type and the company, with the same shrinkage and the study's clustering.

Chosen on 2022 → 2023 only (fold F1: estimate on events whose window closed before 2023, score every 2023 event by its
squared error), then checked once on 2022–23 → 2024 (F2); 2024 was not used to choose. Only E3 and E4 have 2022–2023
events in the archive (E1/E2 start in 2024), so F1 pools E3 + E4. Result on the live archive (2026-11-27, 6 809
clustered events, `python -m kaptan.learn estimators`):

    pooled squared error ÷ the mean's     F1 (chooses)    F2 (checks)
    median                                0.9946          0.9974
    Huber                                 0.9952          0.9946
    20 % trimmed                          0.9961          0.9932
    10 % trimmed                          0.9963          0.9936
    5 % trimmed                           0.9971          0.9954
    10 % winsorised                       0.9975          0.9957
    5 % winsorised                        0.9990          0.9982
    mean                                  1.0000          1.0000

The median had the lowest F1 error and is used (`CHOSEN`); on F2 it still beats the mean. A
trimmed mean would have done better on F2, but switching on 2024's result would be tuning on the check year, so it is
not done. The report recomputes the folds from the pool every week (`walk_forward`).
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Final

from kaptan.learn.tunables import PRIMARY_HORIZON
from kaptan.prices.calendar import IST

Estimator = Callable[[Sequence[float]], float]
SHRINK_K: Final = 20
HUBER_C: Final = 1.345
MAD_SCALE: Final = 1.4826


def mean(xs: Sequence[float]) -> float:
    return math.fsum(xs) / len(xs)


def trimmed(xs: Sequence[float], share: float) -> float:
    s = sorted(xs)
    k = int(len(s) * share)
    kept = s[k : len(s) - k] if len(s) - 2 * k > 0 else s
    return mean(kept)


def winsorised(xs: Sequence[float], share: float) -> float:
    """The `share` lowest and highest values set to the nearest kept one, then the mean."""
    s = sorted(xs)
    k = min(int(len(s) * share), (len(s) - 1) // 2)
    lo, hi = s[k], s[len(s) - 1 - k]
    return mean([min(max(x, lo), hi) for x in xs])


def huber(xs: Sequence[float], c: float = HUBER_C) -> float:
    m = statistics.median(xs)
    scale = statistics.median([abs(x - m) for x in xs]) * MAD_SCALE
    if scale <= 0:
        return m
    for _ in range(100):
        w = [1.0 if abs(x - m) <= c * scale else c * scale / abs(x - m) for x in xs]
        nxt = math.fsum(wi * x for wi, x in zip(w, xs, strict=True)) / math.fsum(w)
        if abs(nxt - m) < 1e-12:
            return nxt
        m = nxt
    return m


ESTIMATORS: Final[dict[str, Estimator]] = {
    "mean": mean,
    "median": statistics.median,
    "trim05": lambda xs: trimmed(xs, 0.05),
    "trim10": lambda xs: trimmed(xs, 0.10),
    "trim20": lambda xs: trimmed(xs, 0.20),
    "wins05": lambda xs: winsorised(xs, 0.05),
    "wins10": lambda xs: winsorised(xs, 0.10),
    "huber": huber,
}
CHOSEN: Final = "median"


@dataclass(frozen=True, slots=True)
class Obs:
    """One clustered event: its company, its publication and its CAR at the type's primary window."""

    kind: str
    ticker: str
    published_at: datetime
    car: float


def shrunk(firm: Sequence[float], typ: float, est: Estimator, k: int = SHRINK_K) -> float:
    if not firm:
        return typ
    w = len(firm) / (len(firm) + k)
    return w * est(firm) + (1 - w) * typ


def predict(train: Sequence[Obs], val: Sequence[Obs], est: Estimator) -> list[float]:
    typ = est([o.car for o in train])
    by_firm: dict[str, list[float]] = defaultdict(list)
    for o in train:
        by_firm[o.ticker].append(o.car)
    return [shrunk(by_firm.get(o.ticker, []), typ, est) for o in val]


def sse(train: Sequence[Obs], val: Sequence[Obs], est: Estimator) -> float:
    return math.fsum((p - o.car) ** 2 for p, o in zip(predict(train, val, est), val, strict=True))


@dataclass(frozen=True, slots=True)
class FoldResult:
    kind: str
    fold: str
    n_train: int
    n_val: int
    error_ratio: float | None  # SSE(chosen) / SSE(mean); None without train or validation events


FOLDS: Final = (
    ("2022 → 2023", date(2023, 1, 1), date(2024, 1, 1)),
    ("2022–23 → 2024", date(2024, 1, 1), date(2025, 1, 1)),
)


def _closed_before(o: Obs, cutoff: date) -> bool:
    """The event's window closed before `cutoff` (calendar margin ≥ its sessions: 20 → 32 days, 5 → 9)."""
    margin = timedelta(days=32 if PRIMARY_HORIZON[o.kind] == 20 else 9)
    return o.published_at.astimezone(IST).date() + margin < cutoff


def fold_sets(obs: Sequence[Obs], kind: str, start: date, end: date) -> tuple[list[Obs], list[Obs]]:
    mine = [o for o in obs if o.kind == kind]
    train = [o for o in mine if _closed_before(o, start)]
    val = [o for o in mine if start <= o.published_at.astimezone(IST).date() < end]
    return train, val


def walk_forward(obs: Sequence[Obs], chosen: str = CHOSEN) -> list[FoldResult]:
    out = []
    for kind in PRIMARY_HORIZON:
        for name, start, end in FOLDS:
            train, val = fold_sets(obs, kind, start, end)
            ratio = None
            if train and val:
                base = sse(train, val, mean)
                ratio = sse(train, val, ESTIMATORS[chosen]) / base if base > 0 else None
            out.append(FoldResult(kind, name, len(train), len(val), ratio))
    return out


def pooled_ratio(obs: Sequence[Obs], fold: int, kinds: Sequence[str], est: str) -> float | None:
    """Σ SSE(est) / Σ SSE(mean) over `kinds` in fold `fold` (0 = F1): the selection criterion."""
    _name, start, end = FOLDS[fold]
    num = den = 0.0
    for kind in kinds:
        train, val = fold_sets(obs, kind, start, end)
        if train and val:
            num += sse(train, val, ESTIMATORS[est])
            den += sse(train, val, mean)
    return None if den <= 0 else num / den


def choose(obs: Sequence[Obs], kinds: Sequence[str] = ("E3", "E4")) -> str:
    """The estimator with the lowest pooled F1 error (2022 → 2023 only; ties keep the earlier name)."""
    scores = {name: pooled_ratio(obs, 0, kinds, name) for name in ESTIMATORS}
    known = {k: v for k, v in scores.items() if v is not None}
    return min(known, key=lambda k: known[k]) if known else "mean"
