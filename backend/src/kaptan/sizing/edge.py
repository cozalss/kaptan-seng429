"""Expected edge from the event study (06 §8.2). Pure.

    CAR_type = mean CAR[1,H] of every past event of the type (market-wide)
    CAR_firm = mean CAR[1,H] of the company's own past events of the type (n_f events)
    w        = n_f / (n_f + 20)                       shrinkage toward the type mean
    edge_raw = w × CAR_firm + (1 − w) × CAR_type
    edge_adj = 0.5 × edge_raw                          post-publication decay (McLean & Pontiff)
H = the type's primary window (E1/E2: 20 sessions, E3/E4: 5). No type-level events → no edge (unknown).
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


def mean_car(result: StudyResult | None, horizon: int) -> tuple[Decimal | None, int]:
    if result is None or result.n == 0 or horizon not in result.stats:
        return None, 0
    return Decimal(str(result.stats[horizon].mean)).quantize(CAR_DIGITS), result.n


def shrunk_edge(
    event_type: str,
    type_study: StudyResult | None,
    firm_study: StudyResult | None,
    p: SizingParams = DEFAULT_SIZING,
) -> EdgeEstimate | None:
    h = p.horizon[event_type]
    car_type, n_type = mean_car(type_study, h)
    if car_type is None:
        return None
    car_firm, n_firm = mean_car(firm_study, h)
    w = Decimal(n_firm) / Decimal(n_firm + p.shrink_k) if car_firm is not None else Decimal(0)
    raw = w * (car_firm or Decimal(0)) + (1 - w) * car_type
    return EdgeEstimate(h, car_type, n_type, car_firm, n_firm, w, raw, p.haircut * raw)
