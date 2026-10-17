"""Mirror of kaptan-panel/src/lib/domain/reports.ts (morning brief, evaluation). Not served in M1."""

from __future__ import annotations

from typing import Annotated, Final, Literal

from pydantic import Field

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel, NonNegInt
from kaptan.domain.schemas.disclosure import DisclosureListItem
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
