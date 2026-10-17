"""Mirror of kaptan-panel/src/lib/domain/agents.ts (agent outputs, 05-ajan-spesifikasyonlari)."""

from __future__ import annotations

from typing import Annotated, Final, Literal

from pydantic import AfterValidator, Field, model_validator

from kaptan.domain.schemas._base import Confidence, IsoDate, IsoDateTime, KModel, NonNegFloat, NonNegInt, PosFloat
from kaptan.domain.schemas.common import AbstainInfo, AgentStatus, EventCode, EventType, SourceQuote

# ── plumbing nodes (05 §5.0) ────────────────────────────────────────────


class RouteResult(KModel):
    route: str
    sub_type_hint: str | None
    table_version: str


class PreGateResult(KModel):
    passed: bool
    reasons: list[str]


GUARD_QUARANTINE: Final = 0.9
GUARD_SOFT: Final = 0.5


class GuardResult(KModel):
    quarantined: bool
    injection_score: Confidence
    regex_hits: list[str]
    chunks_scored: NonNegInt
    masked_names_n: NonNegInt


# ── classifier (threshold 0.80) ─────────────────────────────────────────
CLASSIFIER_MIN_CONFIDENCE: Final = 0.8


class ClassifierOutput(KModel):
    status: AgentStatus
    event_type: EventType
    sub_type: str
    direction: Literal["positive", "negative", "neutral", "unknown"]
    is_correction_or_update: bool
    refers_to_prior_disclosure_date: IsoDate | None
    injection_suspected: bool
    confidence: Confidence
    rationale_tr: str = Field(max_length=400)
    quotes: list[SourceQuote] = Field(min_length=1, max_length=3)
    abstain: AbstainInfo | None


# ── reader (threshold 0.75) ─────────────────────────────────────────────
READER_MIN_CONFIDENCE: Final = 0.75


class _ReaderBase(KModel):
    status: AgentStatus
    confidence: Confidence
    injection_suspected: bool
    quotes: list[SourceQuote] = Field(min_length=1, max_length=8)
    notes_tr: str
    abstain: AbstainInfo | None


class BuybackTxn(KModel):
    trade_date: IsoDate
    nominal_tl: NonNegFloat
    capital_pct: NonNegFloat | None
    price_tl: PosFloat | None
    price_raw: str
    prior_nominal_in_program_tl: NonNegFloat | None


class BuybackExtraction(_ReaderBase):
    kind: Literal["E1"]
    nature: Literal["execution", "program_announcement", "sale_of_repurchased", "program_completed_or_ended", "other"]
    in_programme: bool
    board_decision_date: IsoDate | None
    programme_max_nominal_tl: NonNegFloat | None
    transactions: list[BuybackTxn]
    cumulative_nominal_tl: NonNegFloat | None
    cumulative_capital_pct: NonNegFloat | None
    venue: str | None


InsiderRole = Literal[
    "board_member",
    "executive",
    "controlling_shareholder",
    "related_person_of_insider",
    "investment_fund",
    "other_5pct_holder",
    "unknown",
]


class InsiderTrade(KModel):
    trade_date: IsoDate
    qty: NonNegFloat
    price_tl: PosFloat | None
    value_tl: NonNegFloat | None


class InsiderTradeExtraction(_ReaderBase):
    kind: Literal["E2"]
    filer_kind: Literal["person", "entity", "unknown"]
    person_or_entity: str
    role: InsiderRole
    legal_basis: str | None
    direction: Literal["buy", "sell", "mixed"]
    trades: list[InsiderTrade]
    holding_before_pct: float | None
    holding_after_pct: float | None
    open_market: bool | None
    non_market_reason: str | None


BindingStatus = Literal[
    "signed_contract",
    "order_received",
    "tender_award_final",
    "tender_award_not_final",
    "lowest_or_best_bid_only",
    "framework_agreement",
    "mou_or_loi",
    "unknown",
]


class ContractExtraction(_ReaderBase):
    kind: Literal["E3"]
    counterparty_role: Literal["customer", "supplier", "partner", "other", "unknown"]
    counterparty_name: str | None
    counterparty_disclosed: bool
    counterparty_domestic: bool | None
    counterparty_public_sector: bool | None
    subject_tr: str
    amount: NonNegFloat | None
    currency: str | None
    amount_raw: str | None
    amount_try_stated: NonNegFloat | None
    vat: Literal["included", "excluded", "unknown"]
    amount_is_estimate: bool
    duration_months: NonNegFloat | None
    start_date: IsoDate | None
    binding_status: BindingStatus
    related_party: bool | None
    is_renewal_or_extension: bool
    stated_share_of_revenue_pct: float | None
    stated_effect: str | None


class FinancialReportExtraction(_ReaderBase):
    kind: Literal["E4"]
    period: str = Field(pattern=r"^\d{4}-(Q[1-4]|H1|9M|FY)$")
    report_kind: str
    consolidated: bool
    tms29_applied: bool
    audit_opinion: str | None
    going_concern_emphasis: bool
    guidance_direction: Literal["up", "down", "flat", "none"]
    guidance_statements_tr: list[str]
    one_off_items: list[str]
    management_tone: Literal["positive", "neutral", "negative", "mixed"]
    risk_mentions_tr: list[str]


ReaderOutput = Annotated[
    BuybackExtraction | InsiderTradeExtraction | ContractExtraction | FinancialReportExtraction,
    Field(discriminator="kind"),
]

# ── materiality (threshold 0.70) ────────────────────────────────────────
MATERIALITY_MIN_CONFIDENCE: Final = 0.7


class ValueRef(KModel):
    name: str
    value: float
    ref_id: str


class MaterialityOutput(KModel):
    status: AgentStatus
    event_type: EventCode
    denominator_kind: Literal["annual_revenue", "market_cap", "paid_in_capital", "free_float_mcap", "none"]
    denominator: ValueRef | None
    revenue_available_at_as_of: bool
    market_cap: ValueRef | None
    fx_rates: list[ValueRef]
    trade_day_close: ValueRef | None
    secondary: list[ValueRef]
    e4_lines: list[ValueRef]
    financials_period_end: IsoDate | None
    financials_stale_days: int | None
    data_gaps: list[str]
    confidence: Confidence
    notes_tr: str
    abstain: AbstainInfo | None


# ── evidence ────────────────────────────────────────────────────────────
EvidenceStrength = Literal["strong", "moderate", "weak", "insufficient"]


class EvidenceSelected(KModel):
    ref_id: str = Field(pattern=r"^evt:")
    relevance: Literal["high", "medium"]
    why_similar_tr: str


class EvidenceSelection(KModel):
    status: AgentStatus
    event_type: EventCode
    search_queries: list[str]
    candidates_considered: NonNegInt
    selected: list[EvidenceSelected]
    same_ticker_selected: NonNegInt
    exclusion_reasons: list[str]
    already_announced_before: bool
    already_announced_ref: str | None
    proposed_strength: EvidenceStrength
    summary_tr: str
    confidence: Confidence
    abstain: AbstainInfo | None


class EventStats(KModel):
    ref_id: str
    n: NonNegInt
    n_same_ticker: NonNegInt
    median_car_5d: float
    mean_car_5d: float
    hit_rate_5d: Confidence
    median_car_20d: float
    mean_car_20d: float
    hit_rate_20d: Confidence
    ci95_car_20d: tuple[float, float]
    dispersion_iqr_20d: NonNegFloat


def strength_for_n(n: int) -> EvidenceStrength:
    """Strength is capped by n: >=15 strong, 8-14 moderate, 5-7 weak, <5 insufficient (05)."""
    if n >= 15:
        return "strong"
    if n >= 8:
        return "moderate"
    if n >= 5:
        return "weak"
    return "insufficient"


class EvidenceCard(KModel):
    selection: EvidenceSelection
    stats: EventStats
    strength: EvidenceStrength
    retrieved_ids: list[str]
    card_id: str


class EvidenceEvent(KModel):
    """One past event on the card (returns come from event_returns, never from the LLM)."""

    ref_id: str
    ticker: str
    company_name: str
    published_at: IsoDateTime
    title: str
    car_1d: float
    car_5d: float
    car_20d: float
    car_60d: float | None


# ── skeptic (threshold 0.6) ─────────────────────────────────────────────
SKEPTIC_MIN_CONFIDENCE: Final = 0.6
FlagCode = Literal[
    "DUPLICATE_OR_CORRECTION",
    "NOT_BINDING",
    "RELATED_PARTY",
    "RENEWAL_NOT_NEW",
    "TOKEN_BUYBACK",
    "NOT_OPEN_MARKET",
    "FUND_NOT_INSIDER",
    "DILUTION_OR_HYPE",
    "MANIPULATION_MARKERS",
    "AMOUNT_NOT_IN_TEXT",
    "STALE_OR_WEAK_FINANCIALS",
    "WEAK_EVIDENCE",
    "INJECTION_SUSPECT",
    "OTHER",
]
FlagSeverity = Literal["info", "reduce", "veto"]


class SkepticFlag(KModel):
    code: FlagCode
    severity: FlagSeverity
    detail_tr: str
    supporting_ref: str | None


def _size_multiplier(v: float) -> float:
    if v not in (1, 0.75, 0.5, 0.25):
        raise ValueError("size_multiplier 1, 0.75, 0.5 ya da 0.25 olmalı")
    return v


class SkepticOutput(KModel):
    status: AgentStatus
    flags: list[SkepticFlag]
    size_multiplier: Annotated[float, AfterValidator(_size_multiplier)]
    veto: bool
    strongest_counterargument_tr: str
    confidence: Confidence
    abstain: AbstainInfo | None


# ── compliance ──────────────────────────────────────────────────────────
CheckCode = Literal[
    "SPK_MEASURE",
    "VBTS_MEASURE",
    "WATCHLIST_MARKET",
    "TRADING_HALT",
    "INFO_PUBLIC",
    "MARKET_ABUSE_RISK",
    "RESTRICTED_LIST",
    "SIGNAL_SHARING",
    "PROMPT_INJECTION",
    "RATIONALE_INTEGRITY",
]
REQUIRED_CHECKS: Final[tuple[CheckCode, ...]] = (
    "SPK_MEASURE",
    "VBTS_MEASURE",
    "WATCHLIST_MARKET",
    "INFO_PUBLIC",
    "PROMPT_INJECTION",
    "RATIONALE_INTEGRITY",
)


class ComplianceCheck(KModel):
    code: CheckCode
    result: Literal["pass", "fail", "escalate", "unknown"]
    basis_ref: str | None
    detail_tr: str


class ComplianceReport(KModel):
    status: AgentStatus
    decision: Literal["pass", "escalate", "veto"]
    checks: list[ComplianceCheck] = Field(min_length=6, max_length=10)
    regulation_refs: list[str]
    summary_tr: str
    confidence: Confidence
    abstain: AbstainInfo | None

    @model_validator(mode="after")
    def _required_checks(self) -> ComplianceReport:
        present = {c.code for c in self.checks}
        if not all(code in present for code in REQUIRED_CHECKS):
            raise ValueError("Zorunlu uyum kontrolleri eksik")
        return self
