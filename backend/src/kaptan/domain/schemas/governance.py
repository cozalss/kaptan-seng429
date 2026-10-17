"""Mirror of kaptan-panel/src/lib/domain/governance.ts (audit ledger, limits, notes, settings)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Annotated, Any, Final, Literal

from pydantic import Field, field_validator

from kaptan.domain.roles import Role
from kaptan.domain.schemas._base import IsoDateTime, KModel, NonNegInt, PosInt
from kaptan.domain.schemas.user import Signature

# ── audit log: hash chain (07 §9, 09 §7) ────────────────────────────────
AuditActor = Annotated[str, Field(pattern=r"^(user|agent|system):[^\s]+$")]
AuditAction = Annotated[str, Field(pattern=r"^[a-z_]+\.[a-z_.]+$")]


class AuditEntry(KModel):
    seq: PosInt
    chain_pos: PosInt
    occurred_at: IsoDateTime
    actor: AuditActor
    action: AuditAction
    entity_type: str
    entity_id: str
    run_id: str | None
    strategy_version: str | None
    payload: dict[str, Any]
    prev_hash: str = Field(pattern=r"^[0-9a-f]{2}$|^[0-9a-f]{64}$")
    hash: str = Field(pattern=r"^[0-9a-f]{64}$")


ChainFailureKind = Literal[
    "gap_or_duplicate",
    "prev_hash_mismatch",
    "fields_changed_canonical_stale",
    "hash_mismatch",
    "anchor_mismatch",
]


class ChainAnchor(KModel):
    at: IsoDateTime
    chain_pos: PosInt
    hash: str


class ChainVerifyResult(KModel):
    ok: bool
    first_bad_pos: PosInt | None
    kind: ChainFailureKind | None
    checked: NonNegInt
    head_hash: str
    verified_at: IsoDateTime
    anchor: ChainAnchor | None


class AuditStatus(KModel):
    length: NonNegInt
    head_hash: str
    last_verified_at: IsoDateTime | None
    anchor: ChainAnchor | None


class AuditPage(KModel):
    """GET /audit: one page of the chain, newest first."""

    items: list[AuditEntry]
    total: NonNegInt
    length: NonNegInt
    tamper_on: bool


class AuditListQuery(KModel):
    scope: Literal["today", "all"] = "today"
    q: str | None = None
    limit: int = Field(default=200, gt=0, le=500)

    @field_validator("q")
    @classmethod
    def _q(cls, v: str | None) -> str | None:
        if v is None:
            return None
        text = v.strip()
        if len(text) > 100:
            raise ValueError("Arama en çok 100 karakter")
        return text


# ── limits (07 limit_versions; canonical v1) ────────────────────────────
LimitKey = Literal[
    "risk_per_trade_pct",
    "max_position_pct",
    "max_concurrent_positions",
    "target_concurrent_positions",
    "max_adv_share",
    "price_band_pct",
    "daily_loss_halt_pct",
    "kill_drawdown_pct",
    "min_edge_cost_ratio",
    "crisis_exposure_mult",
    "leak_ret5d_threshold",
    "max_sector_pct",
    "max_group_pct",
]


class LimitValue(KModel):
    key: LimitKey
    value: float


LimitStatus = Literal["proposed", "active", "superseded", "rejected"]


class LimitVersion(KModel):
    version: PosInt
    status: LimitStatus
    reason: str = Field(min_length=1)
    created_at: IsoDateTime
    effective_from: IsoDateTime | None
    values: list[LimitValue]
    proposed_by: Signature
    decided_by: Signature | None


class LimitsView(KModel):
    active: LimitVersion
    pending: LimitVersion | None
    history: list[LimitVersion]


class LimitProposalInput(KModel):
    key: LimitKey
    value: float
    reason: str

    @field_validator("value")
    @classmethod
    def _finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("Değer sonlu bir sayı olmalı")
        return v

    @field_validator("reason")
    @classmethod
    def _reason(cls, v: str) -> str:
        text = v.strip()
        if len(text) < 10:
            raise ValueError("Gerekçe en az 10 harf olmalı")
        if len(text) > 500:
            raise ValueError("En çok 500 karakter")
        return text


class LimitDecisionInput(KModel):
    decision: Literal["approve", "reject"]
    comment: str = ""

    @field_validator("comment")
    @classmethod
    def _comment(cls, v: str) -> str:
        text = v.strip()
        if len(text) > 500:
            raise ValueError("En çok 500 karakter")
        return text


#: Canonical v1 limits (_KANONIK-KARARLAR, 06 §9): the ceiling for every change.
LIMITS_V1: Final[tuple[tuple[LimitKey, float], ...]] = (
    ("risk_per_trade_pct", 0.005),
    ("max_position_pct", 0.1),
    ("max_concurrent_positions", 10),
    ("target_concurrent_positions", 8),
    ("max_adv_share", 0.01),
    ("price_band_pct", 0.02),
    ("daily_loss_halt_pct", -0.01),
    ("kill_drawdown_pct", -0.05),
    ("min_edge_cost_ratio", 2),
    ("crisis_exposure_mult", 0.5),
    ("leak_ret5d_threshold", 0.08),
    ("max_sector_pct", 0.25),
    ("max_group_pct", 0.2),
)


@dataclass(frozen=True, slots=True)
class LimitMeta:
    label_tr: str
    unit: Literal["pct", "count", "ratio", "mult"]
    rule: str
    stricter: Literal["lower", "higher"]


LIMIT_META: Final[dict[LimitKey, LimitMeta]] = {
    "risk_per_trade_pct": LimitMeta("İşlem başına risk", "pct", "R07", "lower"),
    "max_position_pct": LimitMeta("Pozisyon tavanı", "pct", "R07", "lower"),
    "max_concurrent_positions": LimitMeta("En çok eşzamanlı pozisyon", "count", "R08", "lower"),
    "target_concurrent_positions": LimitMeta("Hedef eşzamanlı pozisyon", "count", "R08", "lower"),
    "max_adv_share": LimitMeta("Günlük hacim payı tavanı", "pct", "R07", "lower"),
    "price_band_pct": LimitMeta("Fiyat bandı", "pct", "R09", "lower"),
    "daily_loss_halt_pct": LimitMeta("Günlük zarar durdurması", "pct", "R02", "higher"),
    "kill_drawdown_pct": LimitMeta("Kill switch (zirveden düşüş)", "pct", "R01", "higher"),
    "min_edge_cost_ratio": LimitMeta("Avantaj / maliyet alt sınırı", "ratio", "R06", "higher"),
    "crisis_exposure_mult": LimitMeta("Kriz maruziyet çarpanı", "mult", "R10", "lower"),
    "leak_ret5d_threshold": LimitMeta("Sızıntı eşiği (5 seans)", "pct", "E*", "lower"),
    "max_sector_pct": LimitMeta("Sektör tavanı", "pct", "R08", "lower"),
    "max_group_pct": LimitMeta("Grup tavanı", "pct", "R08", "lower"),
}


def _sign(x: float) -> int:
    return (x > 0) - (x < 0)


def limit_violations(values: list[LimitValue] | list[tuple[LimitKey, float]]) -> list[str]:
    """Why a set of limits is not allowed (empty = fine). Same sentences as the panel's limitViolations().

    Limits may only tighten the canonical v1 set, never loosen it; counts are whole numbers >= 1;
    signs are kept; the target position count may not exceed the maximum.
    """
    by_key: dict[str, float] = {}
    for item in values:
        key, value = (item.key, item.value) if isinstance(item, LimitValue) else item
        by_key[key] = value
    out: list[str] = []
    for key, canon in LIMITS_V1:
        meta = LIMIT_META[key]
        v = by_key.get(key)
        if v is None or not math.isfinite(v):
            out.append(f"{meta.label_tr}: değer eksik.")
            continue
        if meta.unit == "count" and (not float(v).is_integer() or v < 1):
            out.append(f"{meta.label_tr}: en az 1 olan bir tam sayı olmalı.")
        if _sign(v) != _sign(canon):
            out.append(f"{meta.label_tr}: işareti kanonik değerle aynı kalmalı.")
        looser = v > canon if meta.stricter == "lower" else v < canon
        if looser:
            out.append(f"{meta.label_tr}: kanonik sınırdan gevşek olamaz ({meta.rule}).")
    target = by_key.get("target_concurrent_positions")
    maximum = by_key.get("max_concurrent_positions")
    if target is not None and maximum is not None and target > maximum:
        out.append("Hedef eşzamanlı pozisyon, en çok eşzamanlı pozisyondan büyük olamaz.")
    return out


# ── settings: universe, restricted list, live mode (06 §2, R13, R12) ────
RestrictedKind = Literal[
    "spk_tedbir",
    "vbts_brut_takas",
    "vbts_aciga_satis",
    "vbts_kredili_islem",
    "vbts_tek_fiyat",
    "trading_halt",
    "team_insider",
    "other",
]


class RestrictedSecurity(KModel):
    id: str
    ticker: str
    kind: RestrictedKind
    source_ref: str | None
    added_at: IsoDateTime
    added_by: str


class UniverseEntry(KModel):
    ticker: str
    company_name: str
    sector: str
    group: str | None
    free_float_pct: float
    adv20_try: float
    in_universe: bool
    watched: bool


class LiveArmState(KModel):
    config_live: bool
    env_enabled: bool
    ui_key: bool
    armed: bool
    expires_at: IsoDateTime | None


class StrategyVersionInfo(KModel):
    id: str
    frozen_at: IsoDateTime
    scope_tr: str


class ModelInfo(KModel):
    role_tr: str
    model_id: str


class FallbackLink(KModel):
    provider: str
    model_id: str
    note_tr: str


class ConfigView(KModel):
    execution_mode: Literal["paper", "personal", "live"]
    strategy_versions: list[StrategyVersionInfo]
    rules_version: str
    rules_hash: str
    prompt_manifest_hash: str
    config_hash: str
    models: list[ModelInfo]
    fallback_chain: list[FallbackLink]
    kap_poll_seconds: PosInt
    approval_deadline_tr: str
    demo_mode: bool


# ── notes on a proposal ─────────────────────────────────────────────────
class ProposalNote(KModel):
    id: str
    proposal_id: str
    uid: str
    name: str
    role: Role
    body: str = Field(min_length=1, max_length=500)
    created_at: IsoDateTime


class NoteInput(KModel):
    body: str

    @field_validator("body")
    @classmethod
    def _body(cls, v: str) -> str:
        text = v.strip()
        if len(text) < 3:
            raise ValueError("Not en az 3 harf olmalı")
        if len(text) > 500:
            raise ValueError("Not en fazla 500 harf")
        return text


# ── kill switch inputs (API.md §3 #12–14; mock texts) ───────────────────
class KillSwitchInput(KModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def _reason(cls, v: str) -> str:
        text = v.strip()
        if len(text) < 5:
            raise ValueError("Gerekçe en az 5 harf olmalı.")
        if len(text) > 500:
            raise ValueError("En çok 500 karakter")
        return text


class KillResetInput(KModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def _reason(cls, v: str) -> str:
        text = v.strip()
        if len(text) < 10:
            raise ValueError("Gerekçe en az 10 harf olmalı.")
        if len(text) > 500:
            raise ValueError("En çok 500 karakter")
        return text
