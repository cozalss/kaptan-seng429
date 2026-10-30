"""08 §1.5 classification metrics with hand-computed answers."""

from __future__ import annotations

import pytest

from kaptan.eval.clf_metrics import bootstrap_ci, confusion, ece, macro_f1_of, mcnemar, per_class

LABELS = ("E1", "E3", "O")
GOLD = ["E1", "E1", "E3", "E3", "O", "O"]
PRED = ["E1", "E3", "E3", "E3", "O", "E1"]


def test_per_class_and_macro_f1() -> None:
    rows = {r["cls"]: r for r in per_class(GOLD, PRED, LABELS)}
    assert rows["E1"] == {"cls": "E1", "precision": 0.5, "recall": 0.5, "f1": 0.5, "support": 2}
    assert rows["E3"] == {"cls": "E3", "precision": 0.6667, "recall": 1.0, "f1": 0.8, "support": 2}
    assert rows["O"]["recall"] == 0.5 and rows["O"]["precision"] == 1.0
    assert macro_f1_of(list(rows.values())) == pytest.approx((0.5 + 0.8 + 0.6667) / 3, abs=1e-4)
    empty = per_class(["E1"], ["E1"], ("E1", "E4"))
    assert empty[1] == {"cls": "E4", "precision": 0.0, "recall": 0.0, "f1": 0.0, "support": 0}
    assert macro_f1_of(empty) == 1.0
    assert macro_f1_of([]) == 0.0
    with pytest.raises(ValueError, match="length"):
        per_class(["E1"], [], LABELS)


def test_confusion_rows_are_gold() -> None:
    assert confusion(GOLD, PRED, LABELS) == [[1, 1, 0], [0, 2, 0], [1, 0, 1]]
    assert confusion(["E1"], ["ABSTAIN"], LABELS) == [[0, 0, 0], [0, 0, 0], [0, 0, 0]]


def test_ece() -> None:
    assert ece([], []) == 0.0
    assert ece([1.0, 1.0], [True, True]) == 0.0
    assert ece([0.9, 0.9], [True, False]) == pytest.approx(0.4)
    assert ece([0.0], [False]) == 0.0
    with pytest.raises(ValueError, match="length"):
        ece([0.5], [])
    with pytest.raises(ValueError, match="outside"):
        ece([1.5], [True])


def test_bootstrap_ci_brackets_the_point_estimate_and_is_reproducible() -> None:
    def acc(g: list[str] | tuple[str, ...], p: list[str] | tuple[str, ...]) -> float:
        return sum(a == b for a, b in zip(g, p, strict=True)) / len(g)

    gold, pred = GOLD * 10, PRED * 10
    lo, hi = bootstrap_ci(gold, pred, acc, n=300)
    assert lo <= acc(gold, pred) <= hi
    assert (lo, hi) == bootstrap_ci(gold, pred, acc, n=300)
    with pytest.raises(ValueError, match="no items"):
        bootstrap_ci([], [], acc)


def test_mcnemar() -> None:
    gold = ["E1"] * 20
    a = ["E1"] * 15 + ["O"] * 5
    b = ["E1"] * 5 + ["O"] * 15
    res = mcnemar(gold, a, b)
    assert (res["b"], res["c"]) == (10, 0)
    assert res["chi2"] == pytest.approx(8.1)
    assert res["p_value"] == pytest.approx(0.004427, abs=1e-5)
    assert mcnemar(gold, a, a) == {"b": 0, "c": 0, "chi2": 0.0, "p_value": 1.0}
