"""Mirror of kaptan-panel/src/lib/domain/learning.ts ("Ne öğrendim", GET /me/learning)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from kaptan.domain.schemas._base import IsoDateTime, KModel

LearningKind = Literal["E1", "E2", "E3", "E4"]
LearningChangeStatus = Literal["applied", "proposed", "reverted"]
LearningUnit = Literal["pct", "try"]


class LearningCalibration(KModel):
    n_matured: Annotated[int, Field(ge=0)]
    needed: Annotated[int, Field(ge=1)]
    slope: float | None
    bias_bps: float | None
    factor: float
    active: bool


class LearningKindRow(KModel):
    kind: LearningKind
    label_tr: str
    n: Annotated[int, Field(ge=0)]
    hit_rate: Annotated[float, Field(ge=0, le=1)] | None
    mean_net: float | None
    median_net: float | None
    horizon_days: Annotated[int, Field(ge=1)]
    calibration: LearningCalibration


class LearningChange(KModel):
    version: Annotated[int, Field(ge=1)]
    rule: str
    label_tr: str
    unit: LearningUnit
    from_value: float
    to_value: float
    at: IsoDateTime
    status: LearningChangeStatus
    reason_tr: str
    gain_bps: float
    ci_low_bps: float
    ci_high_bps: float
    n: Annotated[int, Field(ge=0)]
    can_revert: bool


class LearningRejected(KModel):
    rule: str
    label_tr: str
    unit: LearningUnit
    current: float
    candidate: float | None
    reason_tr: str


class LearningFold(KModel):
    kind: LearningKind
    fold: str
    n_train: Annotated[int, Field(ge=0)]
    n_val: Annotated[int, Field(ge=0)]
    error_ratio: float | None


class LearningReport(KModel):
    generated_at: IsoDateTime | None
    auto_apply: bool
    takeaway_tr: str | None
    estimator_tr: str
    kinds: list[LearningKindRow]
    changes: list[LearningChange]
    rejected: list[LearningRejected]
    folds: list[LearningFold]


class LearningSettingsInput(KModel):
    auto_apply: bool
