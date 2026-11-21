"""Mirror of kaptan-panel/src/lib/domain/{price-alerts,restore,weekly}.ts (agent ALERTS)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, model_validator

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel, NonNegInt
from kaptan.domain.schemas.reports import Benchmark, KarneSuggestions

PriceDirection = Literal["above", "below"]
PricePreset = Literal[5, 10]


class PriceAlert(KModel):
    id: str
    ticker: str
    name: str
    direction: PriceDirection
    level: Annotated[float, Field(gt=0)]
    preset_pct: PricePreset | None
    created_at: IsoDateTime
    triggered_at: IsoDateTime | None
    triggered_price: float | None
    current_price: float | None
    current_at: IsoDateTime | None


class PriceAlertInput(KModel):
    """Either a typed `level` or a `preset_pct`, never both."""

    ticker: Annotated[str, Field(pattern=r"^[A-Z0-9]{3,6}$")]
    direction: PriceDirection
    level: Annotated[float, Field(gt=0, lt=1_000_000)] | None = None
    preset_pct: PricePreset | None = None

    @model_validator(mode="after")
    def _one_of(self) -> PriceAlertInput:
        if (self.level is None) == (self.preset_pct is None):
            raise ValueError("Bir fiyat yaz ya da yüzde 5 / yüzde 10 seç.")
        return self


class PriceAlertEvent(KModel):
    id: str
    ticker: str
    name: str
    direction: PriceDirection
    level: float
    price: float
    at: IsoDateTime


class AlertHistoryItem(KModel):
    at: IsoDateTime
    channel: Literal["ntfy", "email"]
    ok: bool
    text: str


class BackupFile(KModel):
    name: str
    at: IsoDateTime
    size_bytes: NonNegInt
    age_days: NonNegInt


class BackupList(KModel):
    available: bool
    folder: str | None
    last_at: IsoDateTime | None
    age_days: NonNegInt | None
    stale: bool
    warning_tr: str | None
    files: list[BackupFile]
    steps_tr: list[str]


class WeeklySummary(KModel):
    start: IsoDate
    end: IsoDate
    label_tr: str
    is_current: bool
    started: bool
    put_in_net: float
    value_start: float | None
    value_end: float | None
    gain_try: float | None
    dividends_try: float | None
    read: NonNegInt
    suggestions: KarneSuggestions
    benchmark: Benchmark
    alerts_sent: NonNegInt
    notes_tr: list[str]
