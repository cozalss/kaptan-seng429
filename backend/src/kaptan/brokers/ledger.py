"""Audit drafts of the order path (approvals, tickets, orders, fills share one shape)."""

from __future__ import annotations

from typing import Any, Final

from kaptan.audit.writer import AuditDraft

#: Mock db.audit(): entries tied to a run carry the live strategy version.
RUN_STRATEGY_VERSION: Final = "v1.1-fwd"


def run_audit(
    actor: str, action: str, entity_type: str, entity_id: str, payload: dict[str, Any], run_id: str | None
) -> AuditDraft:
    return AuditDraft(actor, action, entity_type, entity_id, payload, run_id, RUN_STRATEGY_VERSION)
