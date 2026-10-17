"""Graph state (05 §1.2): JSON-able documents only, so any checkpointer can store it.

`steps` collects one trace row per executed node (the three `Send` branches append in the same
super-step, hence the `operator.add` reducer); `llm_calls` counts model calls the same way.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict


class Step(TypedDict):
    node: str
    status: str  # done | skipped | waiting | failed
    latency_ms: int | None
    tokens_in: int
    tokens_out: int
    model_id: str | None
    prompt_version: str | None
    cached: bool
    parallel_group: str | None
    note_tr: str | None


class KaptanState(TypedDict, total=False):
    route: dict[str, Any]
    pre_gate: dict[str, Any]
    guard: dict[str, Any] | None
    classifier: dict[str, Any] | None
    event_type: str | None  # E1–E4 | IGNORE | None
    reader: dict[str, Any] | None
    materiality: dict[str, Any] | None
    evidence_selection: dict[str, Any] | None
    evidence_card: dict[str, Any] | None
    evidence_events: list[dict[str, Any]]
    merged: dict[str, Any] | None
    skeptic: dict[str, Any] | None
    rules: dict[str, Any] | None  # RuleDecision document + "leakage_multiplier"
    proposal: dict[str, Any] | None  # TradeProposal document
    compliance: dict[str, Any] | None
    risk: dict[str, Any] | None  # {"verdict", "final_qty", "level", "escalation_reasons", "checks": [...]}
    approval_card: dict[str, Any] | None
    decision: dict[str, Any] | None  # the resumed ApprovalDecision
    status: str
    outcome: str | None
    steps: Annotated[list[Step], operator.add]
    llm_calls: Annotated[int, operator.add]
