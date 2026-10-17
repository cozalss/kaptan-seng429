"""Mirror of kaptan-panel/src/lib/domain/personal.ts (the personal-money stages, 12 §1)."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel

StageId = Literal["evidence", "paper", "shadow", "small_real"]


class StageCriterion(KModel):
    id: str
    label_tr: str
    current_tr: str
    target_tr: str
    progress: float | None = Field(ge=0, le=1)
    met: bool
    source: Literal["kanonik", "kisisel"]


class StageInfo(KModel):
    id: StageId
    n: int = Field(ge=0, le=3)
    label_tr: str
    window_tr: str
    summary_tr: str
    status: Literal["done", "current", "next", "locked"]


class PersonalStageStatus(KModel):
    current: StageId
    started_on: IsoDate
    stages: list[StageInfo] = Field(min_length=4, max_length=4)
    criteria: list[StageCriterion]
    ticket_mode_tr: str
    as_of: IsoDateTime
    is_sample: bool
