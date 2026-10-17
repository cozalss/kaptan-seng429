"""Mirror of kaptan-panel/src/lib/domain/crew.ts (the crew, Tayfa)."""

from __future__ import annotations

from typing import Literal

from kaptan.domain.schemas._base import IsoDateTime, KModel, NonNegInt, PosInt

CrewAgent = Literal[
    "classifier", "reader", "materiality", "evidence", "skeptic", "compliance", "rule_engine", "risk_gate"
]
CrewActivity = Literal["working", "waiting", "idle", "hold", "degraded"]


class CrewOutput(KModel):
    run_id: str
    ticker: str
    at: IsoDateTime
    status: Literal["done", "skipped", "failed", "waiting", "running"]
    summary_tr: str
    latency_ms: NonNegInt | None
    tokens_in: NonNegInt
    tokens_out: NonNegInt
    model_id: str | None
    cached: bool
    is_fixture: bool


class CrewModelLink(KModel):
    provider: str
    model_id: str
    role: Literal["primary", "fallback", "local", "hold"]


class CrewQuota(KModel):
    provider: str
    used: NonNegInt
    limit: PosInt


class CrewAccuracy(KModel):
    metric_tr: str
    value: float
    target: float | None
    is_sample: bool


class CrewPrompt(KModel):
    prompt_id: str
    version: str
    sha256: str


class CrewMemberStatus(KModel):
    agent: CrewAgent
    activity: CrewActivity
    activity_tr: str
    current_run_id: str | None
    model_chain: list[CrewModelLink]
    active_model: str | None
    quota: CrewQuota | None
    calls_today: NonNegInt
    tokens_today: NonNegInt
    latency_p50_ms: NonNegInt | None
    latency_p95_ms: NonNegInt | None
    accuracy: CrewAccuracy | None
    prompt: CrewPrompt | None
    manifest_hash: str
    recent: list[CrewOutput]
