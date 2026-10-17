"""Mirror of kaptan-panel/src/lib/domain/trading.ts (proposals, approvals, orders, tickets, P&L, risk)."""

from __future__ import annotations

import re
from typing import Annotated, Literal

from pydantic import Field, field_validator

from kaptan.domain.roles import Role
from kaptan.domain.schemas._base import (
    Confidence,
    IsoDate,
    IsoDateTime,
    KModel,
    NonNegFloat,
    NonNegInt,
    PosFloat,
    PosInt,
    Ticker,
)
from kaptan.domain.schemas.agents import EvidenceStrength, FlagCode, FlagSeverity
from kaptan.domain.schemas.common import EventCode
from kaptan.domain.schemas.personal import StageId
from kaptan.domain.schemas.rules import RuleTraceEntry
from kaptan.domain.schemas.user import Signature

Side = Literal["buy", "sell"]
ProposalEventType = EventCode | Literal["EXIT"]
Entry = Literal["next_open_auction", "intraday_limit"]


class Multipliers(KModel):
    evidence: float
    skeptic: float
    leakage: float
    regime: float


class TradeProposal(KModel):
    proposal_id: str
    run_id: str
    strategy_version: str
    rules_hash: str
    prompt_manifest_hash: str
    disclosure_index: PosInt
    ticker: Ticker
    venue: Literal["BIST"]
    side: Side
    event_type: ProposalEventType
    rule_ids: list[str]
    entry: Entry
    limit_price: PosFloat
    ref_price: PosFloat
    ref_price_at: IsoDateTime
    requested_notional_try: NonNegFloat
    requested_qty: NonNegInt
    stop_price: PosFloat
    holding_days_min: PosInt
    holding_days_max: PosInt
    exit_rules: list[str]
    expected_edge_bps: float
    est_cost_bps: NonNegFloat
    multipliers: Multipliers
    confidence: Confidence
    evidence_card_id: str | None
    evidence_ids: list[str]
    retrieved_ids: list[str]
    escalate_required: bool
    degraded: bool


EscalationReason = Literal["COMPLIANCE_ESCALATE", "DEGRADED", "NEAR_MAX_POSITIONS", "RESTRICTED_SELL", "RESIZED"]
ApprovalStatus = Literal["pending", "claimed", "approved", "rejected", "expired", "cancelled"]


class EvidenceSummary(KModel):
    n: NonNegInt
    median_car_5d: float
    median_car_20d: float
    hit_rate_5d: Confidence
    strength: EvidenceStrength
    card_id: str


class CardSkepticFlag(KModel):
    code: FlagCode
    severity: FlagSeverity
    detail_tr: str


class ApprovalCard(KModel):
    kind: Literal["trade_approval"]
    proposal_id: str
    run_id: str
    ticker: Ticker
    company_name: str
    side: Side
    event_type: ProposalEventType
    sub_type_tr: str
    headline_tr: str
    disclosure_index: PosInt
    disclosure_url: str
    final_notional_try: NonNegFloat
    requested_notional_try: NonNegFloat
    limit_price: PosFloat
    qty: NonNegInt
    entry: Entry
    holding_days: tuple[int, int]
    level: Literal["normal", "escalate"]
    escalation_reasons: list[EscalationReason]
    evidence_summary: EvidenceSummary
    skeptic_flags: list[CardSkepticFlag]
    skeptic_note_tr: str
    size_multiplier: float
    compliance_summary_tr: str
    rule_trace_summary: list[RuleTraceEntry]
    degraded: bool
    prompt_manifest_hash: str
    created_at: IsoDateTime
    expires_at: IsoDateTime
    status: ApprovalStatus
    decided_by: str | None
    decided_role: Role | None
    decided_at: IsoDateTime | None
    decision_comment: str | None
    approved_notional_try: float | None
    is_fixture: bool


def _trimmed_max_500(v: str) -> str:
    text = v.strip()
    if len(text) > 500:
        raise ValueError("En çok 500 karakter")
    return text


class ApprovalDecision(KModel):
    """Approve (optionally smaller: shrink only, FR-24) or reject a proposal."""

    decision: Literal["approve", "reject"]
    approved_notional_try: PosFloat | None
    comment: str

    _comment = field_validator("comment")(_trimmed_max_500)


OrderStatus = Literal[
    "pending_open",
    "accepted",
    "awaiting_manual_entry",
    "partially_filled",
    "filled",
    "canceled",
    "rejected",
]
CancelReason = Literal[
    "limit_up_open", "kill_switch", "day_end", "ticket_unfilled", "ticket_canceled", "ticket_expired"
]


class Fill(KModel):
    id: str
    order_id: str
    qty: PosInt
    price: PosFloat
    commission: NonNegFloat
    bsmv: NonNegFloat
    slippage_bps: float
    filled_at: IsoDateTime
    source: Literal["simbist", "alpaca", "manual"]


class FillWithTicker(Fill):
    """The `fill` SSE event's payload."""

    ticker: str


class Order(KModel):
    id: str
    client_order_id: str
    proposal_id: str
    run_id: str
    ticker: Ticker
    company_name: str
    side: Side
    order_type: Literal["market", "limit"]
    tif: Literal["day", "opg"]
    qty: PosInt
    limit_price: PosFloat | None
    status: OrderStatus
    broker: Literal["simbist", "order_ticket"]
    created_at: IsoDateTime
    fills: list[Fill]
    cancel_reason: CancelReason | None = None
    is_fixture: bool


class Position(KModel):
    ticker: Ticker
    company_name: str
    qty: PosInt
    avg_cost: PosFloat
    last_price: PosFloat
    opened_at: IsoDateTime
    planned_exit_date: IsoDate
    holding_days: NonNegInt
    source_proposal: str
    run_id: str
    event_type: EventCode
    strategy_version: str
    unrealized_pnl: float
    realized_pnl: float
    managed_by_exit_rule: bool
    book: Literal["paper", "personal"]


TicketEntryStatus = Literal["awaiting", "entered", "unfilled", "canceled", "expired"]


class TicketEntry(KModel):
    status: TicketEntryStatus
    filled_qty: PosInt | None
    avg_price: PosFloat | None
    filled_at: IsoDateTime | None
    note: str | None
    marked_at: IsoDateTime | None


def _note(v: str | None) -> str | None:
    if v is None:
        return None
    text = v.strip()
    if len(text) > 500:
        raise ValueError("En çok 500 karakter")
    return text


class TicketMarkEntered(KModel):
    mark: Literal["entered"]
    filled_qty: int
    avg_price: float
    filled_at: IsoDateTime
    note: str | None = None

    _note = field_validator("note")(_note)

    @field_validator("filled_qty")
    @classmethod
    def _qty(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Adet pozitif olmalı")
        return v

    @field_validator("avg_price")
    @classmethod
    def _price(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Fiyat pozitif olmalı")
        return v


class TicketMarkUnfilled(KModel):
    mark: Literal["unfilled"]
    note: str | None = None

    _note = field_validator("note")(_note)


class TicketMarkCanceled(KModel):
    mark: Literal["canceled"]
    note: str | None = None

    _note = field_validator("note")(_note)


TicketMarkInput = Annotated[
    TicketMarkEntered | TicketMarkUnfilled | TicketMarkCanceled,
    Field(discriminator="mark"),
]


class ModeKeys(KModel):
    config: bool
    env: bool
    ui: bool


class GateResult(KModel):
    code: str
    passed: bool


class OrderTicket(KModel):
    ticket_no: str
    order_id: str
    proposal_id: str
    run_id: str
    rules_version: str
    approved_at: IsoDateTime
    approval_deadline: IsoDateTime
    created_at: IsoDateTime
    valid_until: IsoDateTime
    mode_keys: ModeKeys
    side: Literal["buy"]
    ticker: Ticker
    company_name: str
    market: str
    order_type: Literal["limit"]
    session_tr: str
    qty: PosInt
    limit_price: PosFloat
    ref_price: PosFloat
    upper_limit: PosFloat
    est_notional_try: PosFloat
    account_equity_try: PosFloat
    event_line_tr: str
    kap_line_tr: str
    materiality_line_tr: str
    leakage_line_tr: str
    evidence_line_tr: str
    cost_line_tr: str
    edge_cost_line_tr: str
    skeptic_line_tr: str
    amount_check_line_tr: str
    stop_line_tr: str
    planned_exit_tr: str
    gate_results: list[GateResult]
    approval_level: Literal["normal", "escalate"]
    stage: StageId
    audit_hash: str
    prev_hash: str
    entry: TicketEntry
    is_fixture: bool


_FIXED_STRATEGIES = {"kaptan:v1.0-fwd", "kaptan:v1.1-fwd", "baseline:xu100_bh", "baseline:ew_universe"}


class PnlPoint(KModel):
    d: IsoDate
    strategy: str
    equity: float
    daily_return: float
    peak_equity: float
    drawdown: float = Field(le=0)
    n_positions: NonNegInt
    n_trades: NonNegInt

    @field_validator("strategy")
    @classmethod
    def _strategy(cls, v: str) -> str:
        if v in _FIXED_STRATEGIES or re.fullmatch(r"ablation:[a-z0-9_]+", v):
            return v
        raise ValueError("Bilinmeyen strateji")


class KillReset(KModel):
    """Restarting after Durdur takes two people: Yönetici starts (1/2), Risk Sorumlusu confirms (2/2)."""

    started: Signature | None


class QuotaRow(KModel):
    provider: str
    used: NonNegInt
    limit: PosInt


class RiskStatus(KModel):
    kill_switch: Literal["off", "on"]
    kill_reason: str | None
    kill_at: IsoDateTime | None
    kill_by: str | None
    halted_today: bool
    daily_pnl_pct: float
    drawdown_pct: float = Field(le=0)
    peak_equity: PosFloat
    equity: PosFloat
    regime: Literal["normal", "crisis"]
    live_armed: bool
    quota: list[QuotaRow]
    reset: KillReset | None
    as_of: IsoDateTime
