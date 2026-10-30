"""Classification metrics of 08 §1.5, pure and dependency-free: per-class precision/recall/F1 with the
confusion matrix, expected calibration error (10 bins), a percentile bootstrap CI for macro-F1 (2 000
resamples, seeded) and McNemar's test (continuity-corrected, df = 1) for two models on the same items.
"""

from __future__ import annotations

import math
import random
from collections.abc import Callable, Sequence
from typing import Any, Final

ECE_BINS: Final = 10
BOOTSTRAP_N: Final = 2_000


def _check(gold: Sequence[str], pred: Sequence[str]) -> None:
    if len(gold) != len(pred):
        raise ValueError("gold and pred differ in length")


def per_class(gold: Sequence[str], pred: Sequence[str], labels: Sequence[str]) -> list[dict[str, Any]]:
    """One row per label: precision, recall, F1 (0 when undefined) and support (gold count)."""
    _check(gold, pred)
    rows: list[dict[str, Any]] = []
    pairs = list(zip(gold, pred, strict=True))
    for lab in labels:
        tp = sum(g == lab and p == lab for g, p in pairs)
        fp = sum(g != lab and p == lab for g, p in pairs)
        fn = sum(g == lab and p != lab for g, p in pairs)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * tp / (2 * tp + fp + fn) if tp + fp + fn else 0.0
        rows.append(
            {"cls": lab, "precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4),
             "support": tp + fn}
        )  # fmt: skip
    return rows


def macro_f1_of(rows: Sequence[dict[str, Any]]) -> float:
    """Mean F1 over the classes that occur (support > 0)."""
    seen = [r["f1"] for r in rows if r["support"] > 0]
    return round(sum(seen) / len(seen), 4) if seen else 0.0


def confusion(gold: Sequence[str], pred: Sequence[str], labels: Sequence[str]) -> list[list[int]]:
    """rows = gold, cols = predicted, in `labels` order; a prediction outside `labels` is not counted."""
    _check(gold, pred)
    index = {lab: i for i, lab in enumerate(labels)}
    matrix = [[0] * len(labels) for _ in labels]
    for g, p in zip(gold, pred, strict=True):
        if g in index and p in index:
            matrix[index[g]][index[p]] += 1
    return matrix


def ece(confidences: Sequence[float], correct: Sequence[bool], bins: int = ECE_BINS) -> float:
    """Expected calibration error: Σ |bin| / n · |accuracy(bin) − confidence(bin)| over equal-width bins."""
    if len(confidences) != len(correct):
        raise ValueError("confidences and correct differ in length")
    if not confidences:
        return 0.0
    if any(not 0.0 <= c <= 1.0 for c in confidences):
        raise ValueError("confidence outside [0, 1]")
    total, n = 0.0, len(confidences)
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        members = [i for i, c in enumerate(confidences) if (lo < c <= hi) or (b == 0 and c == 0.0)]
        if not members:
            continue
        acc = sum(correct[i] for i in members) / len(members)
        conf = sum(confidences[i] for i in members) / len(members)
        total += len(members) / n * abs(acc - conf)
    return round(total, 4)


def bootstrap_ci(
    gold: Sequence[str],
    pred: Sequence[str],
    metric: Callable[[Sequence[str], Sequence[str]], float],
    *,
    n: int = BOOTSTRAP_N,
    alpha: float = 0.05,
    seed: int = 429,
) -> tuple[float, float]:
    """Percentile bootstrap CI of `metric` over items resampled with replacement (seeded, reproducible)."""
    _check(gold, pred)
    if not gold:
        raise ValueError("no items")
    rng = random.Random(seed)  # noqa: S311 - a reproducible resample, not a secret
    k = len(gold)
    scores = []
    for _ in range(n):
        idx = [rng.randrange(k) for _ in range(k)]
        scores.append(metric([gold[i] for i in idx], [pred[i] for i in idx]))
    scores.sort()
    lo = scores[math.floor(alpha / 2 * (n - 1))]
    hi = scores[math.ceil((1 - alpha / 2) * (n - 1))]
    return round(lo, 4), round(hi, 4)


def mcnemar(gold: Sequence[str], pred_a: Sequence[str], pred_b: Sequence[str]) -> dict[str, float]:
    """McNemar's test on the discordant pairs: b = A right & B wrong, c = A wrong & B right."""
    _check(gold, pred_a)
    _check(gold, pred_b)
    b = sum(g == a and g != x for g, a, x in zip(gold, pred_a, pred_b, strict=True))
    c = sum(g != a and g == x for g, a, x in zip(gold, pred_a, pred_b, strict=True))
    if b + c == 0:
        return {"b": 0, "c": 0, "chi2": 0.0, "p_value": 1.0}
    chi2 = (abs(b - c) - 1) ** 2 / (b + c)
    return {"b": b, "c": c, "chi2": round(chi2, 4), "p_value": round(math.erfc(math.sqrt(chi2 / 2)), 6)}
