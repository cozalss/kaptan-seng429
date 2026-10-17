"""Mirror of kaptan-panel/src/lib/domain/run.ts (graph nodes, runs, the Explain payload)."""

from __future__ import annotations

from typing import Final, Literal

from kaptan.domain.schemas._base import IsoDateTime, KModel, NonNegInt, PosInt
from kaptan.domain.schemas.agents import (
    ClassifierOutput,
    ComplianceReport,
    EvidenceCard,
    EvidenceEvent,
    GuardResult,
    MaterialityOutput,
    PreGateResult,
    ReaderOutput,
    RouteResult,
    SkepticOutput,
)
from kaptan.domain.schemas.common import EventType
from kaptan.domain.schemas.disclosure import DisclosureListItem, DisclosureText
from kaptan.domain.schemas.rules import MergedFeatures, RiskCheck, RuleDecision
from kaptan.domain.schemas.trading import ApprovalCard, Fill, Order, OrderTicket, TradeProposal

NodeName = Literal[
    "route",
    "pre_gate",
    "guard",
    "classifier",
    "reader",
    "materiality",
    "evidence",
    "merge",
    "skeptic",
    "rule_engine",
    "compliance",
    "risk_gate",
    "request_approval",
    "approval",
    "execute",
    "record",
    "filter_action",
]

NODE_LABELS: Final[dict[str, tuple[str, Literal["llm", "code", "human"]]]] = {
    "route": ("Yönlendirme", "code"),
    "pre_gate": ("Ön eleme", "code"),
    "guard": ("Koruma", "code"),
    "classifier": ("Sınıflandırıcı", "llm"),
    "reader": ("Okuyucu", "llm"),
    "materiality": ("Önemlilik", "llm"),
    "evidence": ("Kanıt", "llm"),
    "merge": ("Birleştirme", "code"),
    "skeptic": ("Şüpheci", "llm"),
    "rule_engine": ("Kural motoru", "code"),
    "compliance": ("Uyum", "llm"),
    "risk_gate": ("Risk kapısı", "code"),
    "request_approval": ("Onay talebi", "code"),
    "approval": ("Onay", "human"),
    "execute": ("Yürüt", "code"),
    "record": ("Kaydet", "code"),
    "filter_action": ("Filtre eylemi", "code"),
}

RunStatus = Literal["running", "interrupted", "completed", "failed", "hold_quota", "skipped"]
RunOutcome = Literal["PROPOSE", "NO_TRADE", "HOLD", "QUARANTINED", "PREGATE_VETO"]
RunMode = Literal["paper", "personal", "live", "backtest", "replay", "demo"]


class RunSummary(KModel):
    run_id: str
    disclosure_index: PosInt
    ticker: str
    company_name: str
    event_type: EventType | None
    status: RunStatus
    outcome: RunOutcome | None
    mode: RunMode
    started_at: IsoDateTime
    finished_at: IsoDateTime | None
    llm_calls: NonNegInt
    tokens_in: NonNegInt
    tokens_out: NonNegInt
    latency_ms: NonNegInt
    strategy_version: str
    is_fixture: bool


class TraceNode(KModel):
    node: NodeName
    status: Literal["done", "skipped", "failed", "waiting", "running"]
    started_at: IsoDateTime | None
    latency_ms: NonNegInt | None
    tokens_in: NonNegInt
    tokens_out: NonNegInt
    model_id: str | None
    prompt_version: str | None
    cached: bool
    parallel_group: str | None
    note_tr: str | None


class RunTrace(KModel):
    nodes: list[TraceNode]
    langsmith_url: str | None


class SourceSpan(KModel):
    start: int
    end: int
    field: str


class AuditPosition(KModel):
    chain_pos: PosInt
    action: str
    hash: str


class Explain(KModel):
    """GET /runs/{run_id}/explain — every field null when its node did not run (04 §11, FR-31)."""

    run: RunSummary
    disclosure: DisclosureListItem
    texts: list[DisclosureText]
    source_spans: list[SourceSpan]
    route: RouteResult | None
    pre_gate: PreGateResult | None
    guard: GuardResult | None
    classifier: ClassifierOutput | None
    reader: ReaderOutput | None
    materiality: MaterialityOutput | None
    evidence_card: EvidenceCard | None
    evidence_events: list[EvidenceEvent]
    merged: MergedFeatures | None
    skeptic: SkepticOutput | None
    rule_decision: RuleDecision | None
    compliance: ComplianceReport | None
    risk_checks: list[RiskCheck]
    proposal: TradeProposal | None
    approval: ApprovalCard | None
    orders: list[Order]
    fills: list[Fill]
    ticket: OrderTicket | None
    audit_positions: list[AuditPosition]
    trace: RunTrace
