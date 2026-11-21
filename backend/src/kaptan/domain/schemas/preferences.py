"""Mirror of kaptan-panel/src/lib/domain/preferences.ts (pause, alert preferences, backup, password change)."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from pydantic import Field, model_validator

from kaptan.domain.schemas._base import IsoDateTime, KModel

HourMinute = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
MAX_PAUSE_DAYS = 90


class KindChoice(KModel):
    phone: bool
    desktop: bool


class QuietHours(KModel):
    on: bool
    start: HourMinute
    end: HourMinute


class AlertKinds(KModel):
    suggestion: KindChoice
    day_halt: KindChoice
    stopped: KindChoice
    part_down: KindChoice
    watched: KindChoice


class AlertPrefs(KModel):
    kinds: AlertKinds
    quiet: QuietHours


class Pause(KModel):
    active: bool
    until: IsoDateTime | None
    since: IsoDateTime | None


class Preferences(KModel):
    pause: Pause
    alerts: AlertPrefs


class PauseInput(KModel):
    """Either `days` (from now) or `until` (the first day KAPtan works again), never both."""

    days: Annotated[int, Field(ge=1, le=MAX_PAUSE_DAYS)] | None = None
    until: date | None = None

    @model_validator(mode="after")
    def _one_of(self) -> PauseInput:
        if (self.days is None) == (self.until is None):
            raise ValueError("Kaç gün ya da hangi tarihe kadar olduğunu yaz.")
        return self


class BackupStatus(KModel):
    state: Literal["idle", "waiting", "running"]
    last_at: IsoDateTime | None
    last_ok: bool | None
    requested_at: IsoDateTime | None
    folder: str | None
    message_tr: str


class PasswordChanged(KModel):
    signed_out_others: Annotated[int, Field(ge=0)]
