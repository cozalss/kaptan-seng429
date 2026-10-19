"""The KAPtan agent graph (04 §5, 05 §1.1) on LangGraph 1.x.

route → pre_gate ─(veto)→ record
                └→ guard ─(quarantine)→ compliance → record
                        └→ classifier ─(not E1–E4)→ filter_action → record
                                     └─ Send ×3 → reader ‖ materiality ‖ evidence → merge → skeptic
                                        → rule_engine ─(NO_TRADE/HOLD)→ record
                                        → compliance ─(veto)→ record
                                        → risk_gate ─(reject/hold)→ record
                                        → request_approval → approval [interrupt()] ─(reject/expire)→ record
                                                                                  └(approve)→ execute → record
Resume an interrupted run with `Command(resume={"decision": "approve", ...})` on the same thread_id.
"""

from __future__ import annotations

from typing import Any, Final, Literal

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Send

from kaptan.agents.checkpoint import MEMORY_SAVER, current_saver
from kaptan.agents.context import RunContext
from kaptan.agents.nodes import analysts, decide, merge, screen
from kaptan.agents.state import KaptanState

BRANCHES: Final = ("reader", "materiality", "evidence")
EVENT_TYPES: Final = frozenset({"E1", "E2", "E3", "E4"})


def after_pre_gate(state: KaptanState) -> Literal["guard", "record"]:
    return "guard" if state["pre_gate"]["passed"] else "record"


def after_guard(state: KaptanState) -> Literal["classifier", "compliance", "record"]:
    # A quarantined text never reaches the analysts; Compliance puts the refusal on record.
    guard = state.get("guard")
    if guard is None:
        return "record"
    return "compliance" if guard["quarantined"] else "classifier"


def after_classifier(state: KaptanState) -> list[Send] | Literal["filter_action", "record"]:
    if state.get("classifier") is None:
        return "record"
    if state.get("event_type") not in EVENT_TYPES:
        return "filter_action"
    payload = dict(state)
    return [Send(branch, payload) for branch in BRANCHES]


def after_rules(state: KaptanState) -> Literal["compliance", "record"]:
    return "compliance" if state.get("proposal") else "record"


def after_compliance(state: KaptanState) -> Literal["risk_gate", "record"]:
    if state.get("compliance") is None or state.get("outcome") != "PROPOSE" or not state.get("proposal"):
        return "record"
    return "risk_gate"


def after_risk(state: KaptanState) -> Literal["request_approval", "record"]:
    return "request_approval" if (state.get("risk") or {}).get("verdict") in ("pass", "resize") else "record"


def after_approval(state: KaptanState) -> Literal["execute", "record"]:
    return "execute" if (state.get("decision") or {}).get("decision") == "approve" else "record"


def build_graph() -> StateGraph[Any, RunContext, Any, Any]:
    g: StateGraph[Any, RunContext, Any, Any] = StateGraph(KaptanState, context_schema=RunContext)
    g.add_node("route", screen.route)
    g.add_node("pre_gate", screen.pre_gate)
    g.add_node("guard", screen.guard)
    g.add_node("classifier", analysts.classifier)
    g.add_node("reader", analysts.reader)
    g.add_node("materiality", analysts.materiality)
    g.add_node("evidence", analysts.evidence)
    g.add_node("merge", merge.merge)
    g.add_node("skeptic", analysts.skeptic)
    g.add_node("rule_engine", decide.rule_engine)
    g.add_node("compliance", analysts.compliance)
    g.add_node("risk_gate", decide.risk_gate)
    g.add_node("request_approval", decide.request_approval)
    g.add_node("approval", decide.approval)
    g.add_node("execute", decide.execute)
    g.add_node("filter_action", decide.filter_action)
    g.add_node("record", decide.record)

    g.add_edge(START, "route")
    g.add_edge("route", "pre_gate")
    g.add_conditional_edges("pre_gate", after_pre_gate, ["guard", "record"])
    g.add_conditional_edges("guard", after_guard, ["classifier", "compliance", "record"])
    g.add_conditional_edges("classifier", after_classifier, [*BRANCHES, "filter_action", "record"])
    for branch in BRANCHES:
        g.add_edge(branch, "merge")  # same super-step → merge runs once
    g.add_edge("merge", "skeptic")
    g.add_edge("skeptic", "rule_engine")
    g.add_conditional_edges("rule_engine", after_rules, ["compliance", "record"])
    g.add_conditional_edges("compliance", after_compliance, ["risk_gate", "record"])
    g.add_conditional_edges("risk_gate", after_risk, ["request_approval", "record"])
    g.add_edge("request_approval", "approval")
    g.add_conditional_edges("approval", after_approval, ["execute", "record"])
    g.add_edge("execute", "record")
    g.add_edge("filter_action", "record")
    g.add_edge("record", END)
    return g


#: The in-process checkpointer (M1 default). `CHECKPOINTER=postgres` installs an AsyncPostgresSaver
#: instead (kaptan.agents.checkpoint.open_saver); compile_graph() picks whichever is current.
CHECKPOINTER: Final = MEMORY_SAVER


def compile_graph(
    checkpointer: BaseCheckpointSaver[Any] | None = None,
) -> CompiledStateGraph[Any, RunContext, Any, Any]:
    return build_graph().compile(checkpointer=checkpointer or current_saver())
