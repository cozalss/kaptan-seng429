"""Backend-only: the weekly forward-paper report (08 §4.2) as data (`GET /reports/forward/weekly`, API.md §5.3)."""

from __future__ import annotations

from pydantic import Field

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel, NonNegInt


class ForwardPipeline(KModel):
    disclosures: NonNegInt
    noise: NonNegInt
    classified: NonNegInt
    by_event: dict[str, NonNegInt]
    quarantined: NonNegInt
    signals: NonNegInt
    to_approval: NonNegInt
    approved: NonNegInt
    rejected: NonNegInt
    expired: NonNegInt


class ForwardStrategyRow(KModel):
    strategy: str
    week_return: float | None
    cumulative: float | None
    max_dd: float = Field(le=0)


class ForwardTrade(KModel):
    version: str
    ticker: str
    event_type: str
    opened_at: IsoDateTime
    closed_at: IsoDateTime
    exit_rule: str
    return_: float = Field(alias="return", serialization_alias="return")
    realized_pnl_try: float


class ForwardShadow(KModel):
    version: str
    ticker: str
    event_type: str
    rejected_by: str
    excess_5d: float | None
    excess_20d: float | None


class ForwardAgentHealth(KModel):
    runs: NonNegInt
    p50_s: float | None
    p95_s: float | None
    tokens_per_run: NonNegInt
    hold_rate: float
    quota_holds: NonNegInt


class ForwardWeeklyReport(KModel):
    week: str = Field(pattern=r"^\d{4}-W\d{2}$")
    start: IsoDate
    end: IsoDate
    generated_at: IsoDateTime
    config_hash: str
    audit_head: str | None
    pipeline: ForwardPipeline
    portfolio: list[ForwardStrategyRow]
    trades: list[ForwardTrade]
    shadow: list[ForwardShadow]
    agent_health: ForwardAgentHealth
