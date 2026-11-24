"""Mirror of kaptan-panel/src/lib/domain/reports.ts (morning brief, evaluation). Not served in M1."""

from __future__ import annotations

from typing import Annotated, Final, Literal

from pydantic import Field

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel, NonNegInt
from kaptan.domain.schemas.disclosure import DisclosureListItem
from kaptan.domain.schemas.signal import SignalItem
from kaptan.domain.schemas.trading import ApprovalCard, Order, PnlPoint, Position

SAMPLE_LABEL: Final = "örnek değer · gerçek sonuç değil"

EvalClass = Literal["E1", "E2", "E3", "E4", "X", "O"]


class RiskWarning(KModel):
    level: Literal["info", "warn", "critical"]
    text_tr: str


class RestrictionChange(KModel):
    ticker: str
    kind: str
    change: Literal["added", "removed"]
    at: IsoDateTime


class MorningBrief(KModel):
    date: IsoDate
    generated_at: IsoDateTime
    important_disclosures: list[DisclosureListItem]
    orders_for_open: list[Order]
    pending_approvals: list[ApprovalCard]
    open_positions: list[Position]
    expiring_today: list[Position]
    risk_warnings: list[RiskWarning]
    restriction_changes: list[RestrictionChange]
    summary_tr: str
    is_sample: bool
    #: The same important disclosures with line, tone, so-what and suggestion (mine first).
    signals: list[SignalItem] = Field(default_factory=list)
    #: "Bilgisayar kapalıyken kaçırdıkların" note when the heartbeat knows of a gap, else null.
    missed_note_tr: str | None = None


class PerClass(KModel):
    cls: EvalClass
    f1: float
    precision: float
    recall: float
    support: int


class ModelEval(KModel):
    model_id: str
    macro_f1: float
    e3_f1: float
    x_recall: float


class ClassificationEval(KModel):
    split: Literal["gold_test_200"]
    macro_f1: float
    target_macro_f1: Annotated[float, Field(ge=0.85, le=0.85)]
    per_class: list[PerClass]
    confusion: list[list[NonNegInt]]
    kappa: float
    ece: float
    models: list[ModelEval]


class StoreEval(KModel):
    store: Literal["pgvector", "chroma"]
    faithfulness: float
    recall_at_10: float


class RagTrend(KModel):
    d: IsoDate
    faithfulness: float
    context_precision: float
    context_recall: float


class RagEval(KModel):
    questions: Literal[50]
    faithfulness: float
    context_precision: float
    context_recall: float
    recall_at_10: float
    mrr: float
    time_violations: NonNegInt
    stores: list[StoreEval]
    trend: list[RagTrend]


class HoldoutRow(KModel):
    event_type: Literal["E1", "E2", "E3", "E4", "ALL"]
    n: NonNegInt
    car_1: float
    car_5: float
    car_20: float
    car_60: float | None
    t_stat: float
    sharpe: float
    sortino: float
    max_dd: float
    cost_scenario: Literal["base_005", "stress_020"]


class AblationRow(KModel):
    arm: str = Field(pattern=r"^(B[0-3]|A[0-7])$")
    label_tr: str
    sharpe: float
    max_dd: float
    total_return: float
    n_trades: NonNegInt


class L3(KModel):
    window: Literal["2025-01-01 → 2026-10-31"]
    run_once: Literal[True]
    rows: list[HoldoutRow]


class SinceDates(KModel):
    v1_0: IsoDate
    v1_1: IsoDate


class L4(KModel):
    series: list[PnlPoint]
    since: SinceDates
    closed_trades: int


class RedteamByCode(KModel):
    Q: int
    N: int
    H: int
    F: int


class Redteam(KModel):
    malicious: int
    benign: int
    orders_from_malicious: NonNegInt
    block_rate: float
    false_alarm_rate: float
    by_code: RedteamByCode


class Latency(KModel):
    p50_s: float
    p95_s: float
    target_p95_s: Literal[60]


class Cost(KModel):
    calls_today: int
    tokens_today: int
    tokens_per_decision: int


class ShadowRow(KModel):
    proposal_id: str
    ticker: str
    rejected_by: str
    shadow_return_20d: float


class EvalSummary(KModel):
    is_sample: bool
    label: str
    as_of: IsoDateTime
    l1: ClassificationEval
    l2: RagEval
    l3: L3
    l4: L4
    ablations: list[AblationRow]
    redteam: Redteam
    latency: Latency
    cost: Cost
    shadow: list[ShadowRow]


# ── Track record, benchmark, report (Karne), quiet day: mirror of the "Karne" block of reports.ts ──

TrackDecision = Literal["took", "approved_open", "not_bought", "declined", "skipped", "expired", "waiting", "cancelled"]
TrackStatus = Literal["done", "open", "no_data"]
KarnePeriod = Literal["month", "year"]


class TrackItem(KModel):
    """One suggestion KAPtan made and what happened after it (a ratio: 0.032 = +%3,2)."""

    proposal_id: str
    ticker: str
    company_name: str
    suggested_at: IsoDateTime
    decision: TrackDecision
    decision_tr: str
    entry_day: IsoDate
    result_day: IsoDate | None
    planned_sessions: int
    status: TrackStatus
    return_ratio: float | None
    index_ratio: float | None
    result_tr: str


class TrackGroup(KModel):
    n: NonNegInt
    avg_ratio: float | None


class TrackPick(KModel):
    ticker: str
    company_name: str
    ratio: float


class TrackSummary(KModel):
    count: NonNegInt
    done: NonNegInt
    open: NonNegInt
    no_data: NonNegInt
    up: NonNegInt
    down: NonNegInt
    flat: NonNegInt
    avg_ratio: float | None
    index_avg_ratio: float | None
    best: TrackPick | None
    worst: TrackPick | None
    followed_all: TrackGroup
    you_took: TrackGroup
    you_skipped: TrackGroup
    headline_tr: str
    caveat_tr: str | None
    compare_tr: str | None


class TrackRecord(KModel):
    as_of: IsoDateTime
    items: list[TrackItem]
    summary: TrackSummary


class Benchmark(KModel):
    """The person's result over a period against BIST 100 over the same days; nothing when it cannot be had."""

    start: IsoDate | None
    end: IsoDate | None
    available: bool
    you_ratio: float | None
    index_ratio: float | None
    sentence_tr: str | None
    reason_tr: str | None


class KarneSuggestions(KModel):
    made: NonNegInt
    took: NonNegInt
    skipped: NonNegInt
    declined: NonNegInt
    expired: NonNegInt
    waiting: NonNegInt


class Karne(KModel):
    period: KarnePeriod
    label_tr: str
    start: IsoDate
    end: IsoDate
    is_current: bool
    started: bool
    put_in_net: float
    value_start: float | None
    value_end: float | None
    gain_try: float | None
    realized_try: float
    unrealized_try: float | None
    commissions_try: float
    dividends_try: float | None
    suggestions: KarneSuggestions
    decisions: NonNegInt
    track: TrackSummary
    benchmark: Benchmark
    notes_tr: list[str]


class QuietReason(KModel):
    reason_tr: str
    n: NonNegInt


class QuietDay(KModel):
    """Why a day has (no) suggestions, from the day's real counts."""

    day: IsoDate
    read: NonNegInt
    relevant: NonNegInt
    proposals: NonNegInt
    sentence_tr: str
    reasons: list[QuietReason]
