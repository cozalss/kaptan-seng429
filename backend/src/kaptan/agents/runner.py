"""Running the compiled graph once, and the ledger line a finished run leaves."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final, cast

from langchain_core.runnables import RunnableConfig
from langgraph.types import Command

from kaptan.agents.context import RunContext
from kaptan.agents.graph import compile_graph
from kaptan.agents.state import KaptanState
from kaptan.audit.writer import AuditDraft

AUDIT_STRATEGY_VERSION: Final = "v1.1-fwd"


def _config(thread_id: str) -> RunnableConfig:
    return {"configurable": {"thread_id": thread_id}}


async def run_graph(ctx: RunContext, thread_id: str) -> KaptanState:
    """Run until END or the approval interrupt; returns the state values."""
    graph = compile_graph()
    await graph.ainvoke({"steps": [], "llm_calls": 0}, config=_config(thread_id), context=ctx)
    snapshot = await graph.aget_state(_config(thread_id))
    return cast(KaptanState, dict(snapshot.values))


async def resume_graph(ctx: RunContext, thread_id: str, decision: dict[str, Any]) -> KaptanState:
    """Continue an interrupted run with the human decision (Command(resume=…), same thread_id)."""
    graph = compile_graph()
    command: Command[Any] = Command(resume=decision)
    await graph.ainvoke(command, config=_config(thread_id), context=ctx)
    snapshot = await graph.aget_state(_config(thread_id))
    return cast(KaptanState, dict(snapshot.values))


def audit_outcome(explain: dict[str, Any], now: datetime) -> AuditDraft | None:
    """A proposal, a caught hidden instruction or a hard veto leaves one ledger line."""
    run = explain["run"]
    base = {"ticker": run["ticker"], "company": run["company_name"]}
    common = {"run_id": run["run_id"], "strategy_version": AUDIT_STRATEGY_VERSION, "occurred_at": now}
    if explain["approval"] is not None:
        card = explain["approval"]
        return AuditDraft(
            actor="agent:request_approval",
            action="proposal.created",
            entity_type="trade_proposal",
            entity_id=card["proposal_id"],
            payload={**base, "qty": card["qty"]},
            **common,
        )
    if run["outcome"] == "PREGATE_VETO":
        return AuditDraft(
            actor="agent:pre_gate",
            action="risk.rejected",
            entity_type="disclosure",
            entity_id=str(run["disclosure_index"]),
            payload={**base, "reasons": explain["pre_gate"]["reasons"], "llm_calls": 0},
            **common,
        )
    if run["outcome"] == "QUARANTINED":
        return AuditDraft(
            actor="agent:compliance",
            action="compliance.rejected",
            entity_type="disclosure",
            entity_id=str(run["disclosure_index"]),
            payload={**base, "reason": "prompt_injection"},
            **common,
        )
    return None
