"""Expected edge from the event study (06 §8.2). Pure.

    CAR_type = median CAR[1,H] of every past event of the type (market-wide, clustered)
    CAR_firm = median CAR[1,H] of the company's own past events of the type (n_f events)
    w        = n_f / (n_f + 20)                       shrinkage toward the type's value
    edge_raw = w × CAR_firm + (1 − w) × CAR_type
    edge_adj = 0.5 × edge_raw × c                      post-publication decay (McLean & Pontiff) × calibration
H = the type's primary window (E1/E2: 20 sessions, E3/E4: 5). No type-level events → no edge (unknown).
The median replaced the mean (2026-11-27): it had the lowest out-of-sample error on 2022 → 2023 and still beat the
mean on 2022–23 → 2024 (`kaptan.learn.estimators`). `c` is the bounded per-type calibration factor
(`kaptan.learn.calibration`): 1 until 30 decisions of the type have matured.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from kaptan.evidence.study import StudyResult
from kaptan.sizing.params import DEFAULT_SIZING, SizingParams

CAR_DIGITS = Decimal("0.00000001")  # 0.0001 bp: below any decision, above float noise


@dataclass(frozen=True, slots=True)
class EdgeEstimate:
    horizon: int
    car_type: Decimal
    n_type: int
    car_firm: Decimal | None
    n_firm: int
    weight: Decimal
    edge_raw: Decimal
    edge_adj: Decimal
    correction: Decimal = Decimal(1)


def location_car(
    result: StudyResult | None, horizon: int, p: SizingParams = DEFAULT_SIZING
) -> tuple[Decimal | None, int]:
    """The study's robust centre (median by default, `SizingParams.edge_location`) at `horizon`, and its n."""
    if result is None or result.n == 0 or horizon not in result.stats:
        return None, 0
    st = result.stats[horizon]
    value = st.median if p.edge_location == "median" else st.mean
    return Decimal(str(value)).quantize(CAR_DIGITS), result.n


def shrunk_edge(
    event_type: str,
    type_study: StudyResult | None,
    firm_study: StudyResult | None,
    p: SizingParams = DEFAULT_SIZING,
    correction: Decimal = Decimal(1),
) -> EdgeEstimate | None:
    h = p.horizon[event_type]
    car_type, n_type = location_car(type_study, h, p)
    if car_type is None:
        return None
    car_firm, n_firm = location_car(firm_study, h, p)
    w = Decimal(n_firm) / Decimal(n_firm + p.shrink_k) if car_firm is not None else Decimal(0)
    raw = w * (car_firm or Decimal(0)) + (1 - w) * car_type
    return EdgeEstimate(h, car_type, n_type, car_firm, n_firm, w, raw, p.haircut * raw * correction, correction)
