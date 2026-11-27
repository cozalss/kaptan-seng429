"""The weekly threshold test: is one grid step away from a rule's threshold better, net of cost? Pure.

For a threshold `t` at value `c` and each neighbour `v` (`Tunable.neighbours`), on the pool's samples of the rule's
kinds that carry the rule's input:

    expectancy(x, S) = mean net return (CAR − cost) of the samples in S that pass the rule at x
    folds            = (train: years < 2023, check: 2023), (train: < 2024, check: 2024), (train: archive, check: live)
    gain             = expectancy(v, checks) − expectancy(c, checks), the checks of every fold pooled

A step is adopted only if ALL hold (and the caller adds: not changed in the last 7 days, not a step the person took
back): every fold with enough training events prefers v on its training years; ≥ 50 check events pass at v (the
affected bucket); the gain is at least `MARGIN` and its 95 % week-block bootstrap range excludes 0. Otherwise the
first failing reason is reported in plain Turkish. Nothing here reads a sealed year: the pool is already sealed.
"""

from __future__ import annotations

import math
import random
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Final

from kaptan.learn.dataset import Sample
from kaptan.learn.tunables import Tunable
from kaptan.prices.calendar import IST
from kaptan.rules.format import fmt_int, fmt_pct

MIN_N: Final = 50  # check events passing the candidate
MIN_TRAIN: Final = 30  # a fold's training years need this many passing events to state a preference
MARGIN: Final = 0.0005  # 5 bp per decision
BOOT_N: Final = 2000
BOOT_SEED: Final = 429
CHECK_YEARS: Final = (2023, 2024)


@dataclass(frozen=True, slots=True)
class Fold:
    name: str
    train: tuple[Sample, ...]
    check: tuple[Sample, ...]


@dataclass(frozen=True, slots=True)
class Verdict:
    tunable: Tunable
    current: float
    candidate: float | None
    adopt: bool
    reason_tr: str
    gain: float | None = None
    ci: tuple[float, float] | None = None
    n: int = 0

    @property
    def evidence(self) -> dict[str, float | int | None]:
        lo, hi = self.ci or (None, None)
        return {"gain_bps": _bps(self.gain), "ci_low_bps": _bps(lo), "ci_high_bps": _bps(hi), "n": self.n}


def _bps(x: float | None) -> float | None:
    return None if x is None else round(x * 10_000, 1)


def value_text(t: Tunable, x: float) -> str:
    return fmt_pct(x, 2) if t.unit == "pct" else f"{fmt_int(x)} TL"


def points(x: float) -> str:
    """A return difference in percentage points, Turkish: 0.0041 → "+0,4", −0.0012 → "−0,1"."""
    return f"{x * 100:+.1f}".replace(".", ",").replace("-", "−")


def usable(samples: Sequence[Sample], t: Tunable) -> list[Sample]:
    key = t.feature
    return [s for s in samples if s.kind in t.kinds and key is not None and s.features.get(key) is not None]


def folds(samples: Sequence[Sample]) -> list[Fold]:
    archive = [s for s in samples if s.source == "archive"]
    live = tuple(s for s in samples if s.source == "live")
    out = [
        Fold(f"{y - 1} öncesi → {y}", tuple(s for s in archive if s.year < y), tuple(s for s in archive if s.year == y))
        for y in CHECK_YEARS
    ]
    if live:
        out.append(Fold("arşiv → canlı", tuple(archive), live))
    return [f for f in out if f.check]


def passing(samples: Sequence[Sample], t: Tunable, x: float) -> list[Sample]:
    key = t.feature or ""
    return [s for s in samples if t.passes(float(s.features[key] or 0.0), x)]


def expectancy(samples: Sequence[Sample], t: Tunable, x: float) -> float | None:
    got = passing(samples, t, x)
    return math.fsum(s.net for s in got) / len(got) if got else None


def _week(s: Sample) -> date:
    d = s.published_at.astimezone(IST).date()
    return date.fromisocalendar(*d.isocalendar()[:2], 1)


def bootstrap_gain(check: Sequence[Sample], t: Tunable, cur: float, cand: float) -> tuple[float, float]:
    """95 % percentile range of the gain, resampling whole weeks (events of one week move together)."""
    weeks: dict[date, list[Sample]] = defaultdict(list)
    for s in check:
        weeks[_week(s)].append(s)
    blocks = list(weeks.values())
    rng = random.Random(BOOT_SEED)  # noqa: S311 - a reproducible resample, not a secret
    draws = []
    for _ in range(BOOT_N):
        pick = [x for _ in blocks for x in rng.choice(blocks)]
        a, b = expectancy(pick, t, cand), expectancy(pick, t, cur)
        if a is not None and b is not None:
            draws.append(a - b)
    if not draws:
        return (-math.inf, math.inf)
    draws.sort()
    return draws[math.floor(0.025 * (len(draws) - 1))], draws[math.ceil(0.975 * (len(draws) - 1))]


def _train_prefers(f: Fold, t: Tunable, cur: float, cand: float) -> bool | None:
    """None: too few training events to say."""
    if len(passing(f.train, t, cand)) < MIN_TRAIN or len(passing(f.train, t, cur)) < MIN_TRAIN:
        return None
    a, b = expectancy(f.train, t, cand), expectancy(f.train, t, cur)
    return a is not None and b is not None and a > b


def judge(t: Tunable, current: float, cand: float, samples: Sequence[Sample]) -> Verdict:
    pool = usable(samples, t)
    fs = folds(pool)
    check = [s for f in fs for s in f.check]
    n = len(passing(check, t, cand))

    def reject(why: str) -> Verdict:
        return Verdict(t, current, cand, False, why, n=n)

    if n < MIN_N:
        return reject(
            f"Yeterli örnek yok: {value_text(t, cand)} ile geçmişte yalnızca {n} olay var; en az {MIN_N} gerekir."
        )
    prefs = [p for f in fs if (p := _train_prefers(f, t, current, cand)) is not None]
    if not prefs:
        return reject("Önceki yıllarda karşılaştıracak kadar olay yok.")
    if not all(prefs):
        return reject("Önceki yıllar bu değişikliği her seferinde desteklemedi.")
    a, b = expectancy(check, t, cand), expectancy(check, t, current)
    if a is None or b is None:
        return reject("Karşılaştıracak olay yok.")
    gain = a - b
    lo, hi = bootstrap_gain(check, t, current, cand)
    if gain < MARGIN:
        why = (
            f"{value_text(t, cand)} ile geçmiş testte karar başına net getiri artmadı ({points(gain)} puan)."
            if gain <= 0
            else f"{value_text(t, cand)} ile kazanç çok küçük: {points(gain)} puan; en az 0,05 puan gerekir."
        )
        return Verdict(t, current, cand, False, why, gain, (lo, hi), n)
    if lo <= 0:
        why = (
            f"{value_text(t, cand)} ile net getiri {points(gain)} puan arttı ama bu şans eseri olabilir: "
            f"tekrarlı denemede {points(lo)} ile {points(hi)} puan arasında çıktı."
        )
        return Verdict(t, current, cand, False, why, gain, (lo, hi), n)
    return Verdict(t, current, cand, True, "", gain, (lo, hi), n)


def best_step(t: Tunable, current: float, samples: Sequence[Sample]) -> Verdict:
    """The adopted neighbour with the largest gain, else the most informative rejection."""
    if t.feature is None:
        return Verdict(t, current, None, False, "Geçmiş duyurularda bu kuralın ölçtüğü bilgi yok; denenemedi.")
    verdicts = [judge(t, current, v, samples) for v in t.neighbours(current)]
    if not verdicts:
        return Verdict(t, current, None, False, "Aralığın dışına çıkılmaz.")
    adopted = [v for v in verdicts if v.adopt]
    if adopted:
        return max(adopted, key=lambda v: v.gain or 0.0)
    return max(verdicts, key=lambda v: (v.gain is not None, v.gain or 0.0, v.n))
