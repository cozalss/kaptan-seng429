"""Backend-only admin shapes (M3 B3; kaptan-panel/API.md §5.3). The panel does not call these yet.

Rows reuse the panel's zod mirrors (RestrictedSecurity, UniverseEntry fields, ConfigView, LimitValue) so a
later panel screen can adopt them without a shape change.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel
from kaptan.domain.schemas.governance import ConfigView, LimitValue, RestrictedSecurity

__all__ = [
    "AdminConfigView",
    "AdminLimits",
    "AdminUniverseRow",
    "AdminUniverseView",
    "PendingRemoval",
    "RemovalSignature",
    "RestrictedAddInput",
    "RestrictedReasonInput",
    "RestrictedView",
    "UniverseOverride",
    "UniverseOverrideInput",
    "UnmatchedOverride",
]

TICKER_PATTERN = r"^[A-Z0-9]{3,8}$"


class RemovalSignature(KModel):
    uid: str
    name: str
    role: str
    at: str
    reason: str


class PendingRemoval(KModel):
    id: str
    ticker: str
    requested_by: RemovalSignature


class RestrictedView(KModel):
    entries: list[RestrictedSecurity]
    pending_removals: list[PendingRemoval]


class RestrictedAddInput(KModel):
    ticker: str = Field(pattern=TICKER_PATTERN)
    kind: Literal["team_insider", "other"] = "team_insider"
    source_ref: str | None = Field(default=None, max_length=200)
    reason: str = Field(min_length=10, max_length=500)


class RestrictedReasonInput(KModel):
    reason: str = Field(min_length=10, max_length=500)


class UniverseOverride(KModel):
    mode: Literal["include", "exclude"]
    reason: str
    set_by: str
    set_at: IsoDateTime


class UnmatchedOverride(UniverseOverride):
    ticker: str


class AdminUniverseRow(KModel):
    """UniverseEntry's fields + the rules' own answer and the override that changed it (if any)."""

    ticker: str
    company_name: str
    sector: str
    group: str | None
    free_float_pct: float
    adv20_try: float
    in_universe: bool
    watched: bool
    is_eligible: bool
    reasons: list[str]
    override: UniverseOverride | None


class AdminUniverseView(KModel):
    d: IsoDate | None
    rule_version: str | None
    rows: list[AdminUniverseRow]
    unmatched_overrides: list[UnmatchedOverride]


class UniverseOverrideInput(KModel):
    mode: Literal["include", "exclude"]
    reason: str = Field(min_length=10, max_length=500)


class AdminLimits(KModel):
    version: int
    values: list[LimitValue]


class AdminConfigView(KModel):
    view: ConfigView
    settings: dict[str, Any]
    limits: AdminLimits
