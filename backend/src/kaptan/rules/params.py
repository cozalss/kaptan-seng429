"""Frozen strategy parameters of the rule engine (06 §3–§8, §13 `config/rules-v1.0.yaml`).

One immutable set per strategy version; `rules_hash` identifies it in every proposal and in the
audit ledger (the panel mock's RULES_HASH = sha256("rules-v1.0-prereg")[:16]).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Final

RULES_SEED: Final = "rules-v1.0-prereg"


def rules_hash_of(seed: str = RULES_SEED) -> str:
    return hashlib.sha256(seed.encode()).hexdigest()[:16]


@dataclass(frozen=True, slots=True)
class RuleParams:
    """Thresholds the E1–E4 triggers, the leakage filter and the edge/cost check read."""

    version: str = "v1.1-fwd"
    rules_hash: str = field(default_factory=rules_hash_of)
    # confidence floors (05 §2.5)
    min_classifier_confidence: float = 0.80
    min_reader_confidence: float = 0.75
    min_materiality_confidence: float = 0.70
    min_skeptic_veto_confidence: float = 0.60
    # E1 (06 §3.1)
    e1_capital_10d_min: float = 0.0025
    e1_capital_10d_cluster_min: float = 0.0010
    e1_cluster_notices_min: int = 3
    # E2 (06 §3.2)
    e2_min_value_try: float = 1_000_000.0
    # E3 (06 §3.3)
    e3_revenue_materiality_min: float = 0.10
    e3_mcap_materiality_min: float = 0.05
    # E4 (06 §3.4, §4)
    e4_sue_min: float = 1.0
    e4_cfo_quality_min: float = 0.8
    e4_ret10d_max: float = 0.12
    # leakage, edge, evidence (06 §4, §8, R05)
    leak_ret5d_max: float = 0.08
    min_edge_cost_ratio: float = 2.0
    min_evidence_n: int = 5
    # entry / sizing (06 §5, §7)
    limit_markup: Decimal = Decimal("1.02")
    tick: Decimal = Decimal("0.01")
    leakage_half_multiplier: Decimal = Decimal("0.5")
    crisis_multiplier: Decimal = Decimal("0.5")


DEFAULT_PARAMS: Final = RuleParams()

#: Binding statuses that count as a committed contract (06 §3.3).
BINDING_STATUSES: Final = frozenset({"signed_contract", "order_received", "tender_award_final"})
#: Insider roles E2 covers (06 §3.2, Kanonik R2): executives, board members, controlling shareholders.
E2_ROLES: Final = frozenset({"board_member", "executive", "controlling_shareholder"})
