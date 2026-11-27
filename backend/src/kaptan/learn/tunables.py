"""The rule thresholds the weekly pass may move, each with its documented range and grid (06 §13a).

Only a threshold listed here is ever tuned, only inside its range and only one grid step at a time. A threshold
that only halves a size (the leakage filter of E1/E2) changes no trade's return, so it is tuned on E3/E4 only,
where it skips. A threshold whose input the evidence pool does not carry (e.g. E3 materiality needs the contract
amount the Reader reads; the 2022–2024 archive has no Reader answers) is listed with `feature=None`: the pass
reports it as "not testable" instead of guessing. The `RuleParams` field name is the key (`kaptan.rules.params`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

Unit = Literal["pct", "try"]
#: Which side passes the rule (as `kaptan.rules` reads it): "min" → value ≥ threshold; "max" → value < threshold;
#: "max_le" → value ≤ threshold (the leakage filter).
Side = Literal["min", "max", "max_le"]


@dataclass(frozen=True, slots=True)
class Tunable:
    key: str  # RuleParams field
    kinds: tuple[str, ...]  # the event types the rule applies to
    label_tr: str
    noun_tr: str  # for a sentence: "geri alım eşiğini"
    unit: Unit
    side: Side
    lo: float
    hi: float
    step: float
    feature: str | None  # Sample feature the rule reads; None = the pool cannot test it

    def grid(self) -> list[float]:
        n = round((self.hi - self.lo) / self.step)
        return [round(self.lo + i * self.step, 10) for i in range(n + 1)]

    def neighbours(self, current: float) -> list[float]:
        """The candidates one grid step away from `current`, inside the range."""
        out = [round(current - self.step, 10), round(current + self.step, 10)]
        return [v for v in out if self.lo - 1e-12 <= v <= self.hi + 1e-12]

    def passes(self, value: float, threshold: float) -> bool:
        if self.side == "min":
            return value >= threshold
        return value < threshold if self.side == "max" else value <= threshold


TUNABLES: Final[tuple[Tunable, ...]] = (
    Tunable(
        "e1_capital_10d_min", ("E1",), "Geri alım eşiği", "geri alım eşiğini", "pct", "min",
        0.0010, 0.0050, 0.0005, "capital_10d",
    ),
    Tunable(
        "e2_min_value_try", ("E2",), "Yönetici alımı eşiği", "yönetici alımı eşiğini", "try", "min",
        500_000.0, 3_000_000.0, 250_000.0, "insider_value_try",
    ),
    Tunable(
        "e3_revenue_materiality_min", ("E3",), "Yeni iş büyüklük eşiği", "yeni iş büyüklük eşiğini", "pct", "min",
        0.05, 0.20, 0.025, None,
    ),
    Tunable(
        "e4_ret10d_max", ("E4",), "Finansal sonuç öncesi yükseliş sınırı", "sonuç öncesi yükseliş sınırını", "pct",
        "max", 0.08, 0.20, 0.02, "ret_10d",
    ),
    Tunable(
        "leak_ret5d_max", ("E3", "E4"), "Duyuru öncesi yükseliş sınırı", "duyuru öncesi yükseliş sınırını",
        "pct", "max_le", 0.04, 0.12, 0.01, "leak_5d",
    ),
)  # fmt: skip
BY_KEY: Final = {t.key: t for t in TUNABLES}

KIND_LABELS: Final = {"E1": "Geri alım", "E2": "Yönetici alımı", "E3": "Yeni iş", "E4": "Finansal sonuç"}
#: The primary window of each type (06 §12.4): the return the edge, the calibration and the tuning all read.
PRIMARY_HORIZON: Final = {"E1": 20, "E2": 20, "E3": 5, "E4": 5}
