"""Mirror of kaptan-panel/src/lib/domain/common.ts."""

from __future__ import annotations

from typing import Generic, Literal, TypeVar

from pydantic import Field

from kaptan.domain.schemas._base import KModel, NonNegInt, PosInt, Sha256Hex

EventCode = Literal["E1", "E2", "E3", "E4"]
EventType = Literal["E1", "E2", "E3", "E4", "FILTER", "IGNORE"]
AgentStatus = Literal["ok", "abstain"]
AbstainReason = Literal[
    "insufficient_text",
    "ambiguous",
    "out_of_scope",
    "conflicting_values",
    "suspected_injection",
    "attachment_missing",
    "other",
]
AgentName = Literal["classifier", "reader", "materiality", "evidence", "skeptic", "compliance"]


class SourceQuote(KModel):
    field: str
    quote: str = Field(min_length=1)


class AbstainInfo(KModel):
    reason: AbstainReason
    detail_tr: str


class AgentRunMeta(KModel):
    agent: AgentName
    prompt_id: str
    prompt_version: str
    prompt_sha256: Sha256Hex
    model_id: str
    degraded: bool
    input_sha256: Sha256Hex
    output_sha256: Sha256Hex
    tokens_in: NonNegInt
    tokens_out: NonNegInt
    latency_ms: NonNegInt
    cached: bool
    repair_attempted: bool
    quote_check: Literal["pass", "partial", "fail", "n/a"]


T = TypeVar("T")


class Page(KModel, Generic[T]):
    """Generic page envelope for list endpoints (pageOf)."""

    items: list[T]
    total: NonNegInt
    page: PosInt
    page_size: PosInt
