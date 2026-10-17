"""Mirror of kaptan-panel/src/lib/domain/rules.ts (merge node, rule engine, risk gate R01–R16)."""

from __future__ import annotations

from typing import Final, Literal

from pydantic import Field

from kaptan.domain.schemas._base import Confidence, IsoDateTime, KModel, PosInt
from kaptan.domain.schemas.agents import EvidenceStrength
from kaptan.domain.schemas.common import EventType

AgentRunState = Literal["ok", "abstain", "failed", "skipped"]


class MergedFeatures(KModel):
    """Merge node (05 §5.0): deterministic, Decimal ratios, regex amount check."""

    run_id: str
    disclosure_index: PosInt
    ticker: str
    as_of: IsoDateTime
    event_type: EventType
    sub_type: str
    agent_status: dict[str, AgentRunState]
    agent_confidence: dict[str, Confidence]
    any_injection_flag: bool
    degraded: bool
    # E1
    e1_nature: str | None
    new_buyback_rows: int | None
    buyback_10d_capital_pct: float | None
    buyback_10d_notice_count: int | None
    buyback_sale_within_20d: bool | None
    # E2
    insider_role_class: str | None
    insider_open_market: bool | None
    insider_net_buy_value_try: float | None
    insider_buy_to_ff_mcap: float | None
    insider_cluster_30d: int | None
    ret_3m: float | None
    # amount cross-check (R14)
    reader_amount: float | None
    regex_amounts: list[float]
    amount_in_text: bool | None
    # E3
    binding: bool | None
    related_party: bool | None
    renewal: bool | None
    amount_try: float | None
    amount_to_revenue_annualized: float | None
    amount_to_mcap: float | None
    e3_denominator: Literal["annual_revenue", "market_cap"] | None
    # E4 (free-form, e4_* keys)
    e4: dict[str, float | str | bool | None]
    # market
    last_price: float | None
    price_at: IsoDateTime | None
    upper_limit: float | None
    lower_limit: float | None
    adv20_try: float | None
    free_float_pct: float | None
    leakage_5d_mkt_adj: float | None
    ret_10d_mkt_adj: float | None
    # evidence
    evidence_card_id: str | None
    evidence_strength: EvidenceStrength | None
    evidence_n: int | None
    evidence_median_car_5d: float | None
    evidence_median_car_20d: float | None
    evidence_ids: list[str]
    retrieved_ids: list[str]
    flags: list[str]


class RuleTraceEntry(KModel):
    rule: str = Field(pattern=r"^(E[1-4]|LEAK|EDGE|EVIDENCE|AVOID|HOLD)\.[a-z0-9_]+$")
    passed: bool
    observed: str | None
    threshold: str | None
    detail_tr: str


#: Reason codes in consumption order (05).
REASON_CODE_ORDER: Final[tuple[str, ...]] = (
    "HOLD_AGENT_FAILED",
    "HOLD_AGENT_ABSTAIN",
    "HOLD_LOW_CONFIDENCE",
    "HOLD_UNSUPPORTED_VETO",
    "SKEPTIC_VETO",
    "AVOID_LIST",
    "NO_EVIDENCE",
    "INJECTION_REVIEW",
    "E_RULE_NOT_MET",
    "LEAKAGE_HALF",
    "LEAKAGE_SKIP",
    "E_RULE_MET",
)

RuleOutcome = Literal["PROPOSE", "NO_TRADE", "HOLD"]


class RuleDecision(KModel):
    outcome: RuleOutcome
    reason_codes: list[str]
    rules_fired: list[str]
    rules_hash: str
    trace: list[RuleTraceEntry]


RiskRuleCode = Literal[
    "R01",
    "R02",
    "R03",
    "R04",
    "R05",
    "R06",
    "R07",
    "R08",
    "R09",
    "R10",
    "R11",
    "R12",
    "R13",
    "R14",
    "R15",
    "R16",
]

#: Execution order of the pre-trade gate; R16 runs at send time.
RISK_GATE_ORDER: Final[tuple[RiskRuleCode, ...]] = (
    "R01",
    "R02",
    "R03",
    "R04",
    "R13",
    "R11",
    "R14",
    "R05",
    "R06",
    "R09",
    "R12",
    "R07",
    "R08",
    "R10",
    "R15",
)

RISK_RULES: Final[dict[RiskRuleCode, tuple[str, str]]] = {
    "R01": ("Kill switch", "Kill switch açık mı; zirveden düşüş ≤ −%5 mi"),
    "R02": ("Günlük zarar", "Günlük K/Z ≤ −%1 ise yeni emir durur"),
    "R03": ("Evren", "Hisse likidite ve halka açıklık alt sınırıyla evrende mi"),
    "R04": ("Tedbir", "SPK/VBTS tedbiri sert veto; 24 saatten eski tedbir verisi HOLD"),
    "R05": ("Kanıt", "Kanıt kimlikleri getirilenlerin alt kümesi, karar anından önce, n ≥ 5"),
    "R06": ("Avantaj / maliyet", "Beklenen avantaj ≥ 2 × tahmini maliyet"),
    "R07": ("Büyüklük", "%0,5 risk / stop; pozisyon ≤ %10; hacmin ≤ %1'i; nakit"),
    "R08": ("Portföy limitleri", "Mükerrer, en çok 10 pozisyon, günlük giriş, sektör %25, grup %20"),
    "R09": ("Fiyat bandı", "Son fiyat ±%2, tavana %1 yakınlık, 20 dakikadan eski fiyat"),
    "R10": ("Kriz rejimi", "Krizde maruziyet ×0,5; E3 reddedilir"),
    "R11": ("Kota ve veri", "LLM kotası, KAP gecikmesi (300 sn), şema, injection"),
    "R12": ("Yalnızca alım", "Açığa satış yok, kaldıraç yok, kişisel mod silahlanmamış"),
    "R13": ("Ekip engel listesi", "Ekip içeriden-öğrenen engel listesinde değil"),
    "R14": ("Tutar uyuşması", "Okuyucu tutarı metindeki regex tutarlarıyla eşleşiyor (±%0,5)"),
    "R15": ("Onay zorunlu", "Her öneri insan onayına gider; ertesi seans 09:50'de düşer"),
    "R16": ("Gönderim anı", "Onay süresi; R01–R04, R09, R12, R13 yeniden; fiş 30 dk"),
}

RiskOutcome = Literal["pass", "resize", "reject", "hold", "approval_required"]


class RiskCheck(KModel):
    phase: Literal["pre_trade", "at_send"]
    rule_code: RiskRuleCode
    outcome: RiskOutcome
    reason_code: str | None
    detail_tr: str
    observed: str | None
    limit: str | None
