"""Assemble the "Neden bu işlem?" document (the panel's Explain) from a finished or interrupted run.

The live parts (approval status, orders, fills, ticket, audit positions) stay empty here: the runs
service overlays them at read time (package A). The document is validated with the pydantic mirror
of the zod schema before it is stored.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import timedelta
from typing import Any

from kaptan.agents.context import RunContext
from kaptan.agents.state import KaptanState, Step
from kaptan.agents.trace import trace_document
from kaptan.domain.schemas import Explain, iso_ms


def source_spans(text: str, phrases: Sequence[Mapping[str, str]]) -> list[dict[str, Any]]:
    """Character ranges of verbatim phrases (phrases that are not in the text are dropped)."""
    spans: list[dict[str, Any]] = []
    for p in phrases:
        at = text.find(p["quote"])
        if at >= 0:
            spans.append({"start": at, "end": at + len(p["quote"]), "field": p["field"]})
    return spans


def run_summary(state: KaptanState, ctx: RunContext, event_type: str | None) -> dict[str, Any]:
    d = ctx.disclosure
    steps: Sequence[Step] = state.get("steps", [])
    usage = ctx.tools.run_usage(d.fingerprint)
    tokens_in = sum(s["tokens_in"] for s in steps if s["prompt_version"])
    tokens_out = sum(s["tokens_out"] for s in steps if s["prompt_version"])
    latency = sum(s["latency_ms"] or 0 for s in steps)
    if usage is not None:  # replay: the billed numbers of the recorded run
        tokens_in, tokens_out, latency = usage["tokens_in"], usage["tokens_out"], usage["latency_ms"]
    status = state.get("status", "completed")
    return {
        "run_id": d.run_id,
        "disclosure_index": d.disclosure_index,
        "ticker": d.ticker,
        "company_name": d.company_name,
        "event_type": event_type,
        "status": status,
        "outcome": state.get("outcome"),
        "mode": "demo" if d.is_fixture else "paper",
        "started_at": iso_ms(d.available_at),
        "finished_at": None if status == "running" else iso_ms(d.available_at + timedelta(milliseconds=latency)),
        "llm_calls": int(state.get("llm_calls", 0)),
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "latency_ms": latency,
        "strategy_version": d.strategy_version,
        "is_fixture": d.is_fixture,
    }


def classification_of(state: KaptanState, ctx: RunContext) -> dict[str, Any] | None:
    c = state.get("classifier")
    if c is not None and state["route"]["route"] == "llm":
        return {"event_type": c["event_type"], "confidence": c["confidence"], "method": "llm"}
    return ctx.disclosure.stored_classification


def assemble(
    state: KaptanState, ctx: RunContext, disclosure_doc: Mapping[str, Any], texts: Sequence[Mapping[str, str]]
) -> dict[str, Any]:
    d = ctx.disclosure
    steps: list[Step] = list(state.get("steps", []))
    if state.get("status") == "interrupted" and not any(s["node"] == "approval" for s in steps):
        steps.append(_waiting("approval"))
    classification = classification_of(state, ctx)
    rules = state.get("rules")
    reached_rules = rules is not None
    route = dict(state["route"])
    classifier = state.get("classifier")
    if classifier:
        route["sub_type_hint"] = classifier["sub_type"]
    explain = {
        "run": run_summary(state, ctx, (classification or {}).get("event_type")),
        "disclosure": {
            **disclosure_doc,
            "published_at": iso_ms(d.published_at),
            "first_seen_at": iso_ms(d.available_at),
            "available_at": iso_ms(d.available_at),
            "classification": classification,
        },
        "texts": [dict(t) for t in texts],
        "source_spans": source_spans(d.text_tr, ctx.tools.source_phrases(d.fingerprint)),
        "route": route,
        "pre_gate": state["pre_gate"],
        "guard": state.get("guard"),
        "classifier": state.get("classifier") if state["route"]["route"] == "llm" or reached_rules else None,
        "reader": state.get("reader") if reached_rules else None,
        "materiality": state.get("materiality"),
        "evidence_card": state.get("evidence_card"),
        "evidence_events": list(state.get("evidence_events", [])),
        "merged": state.get("merged"),
        "skeptic": state.get("skeptic"),
        "rule_decision": None if rules is None else {k: v for k, v in rules.items() if k != "leakage_multiplier"},
        "compliance": state.get("compliance"),
        "risk_checks": list((state.get("risk") or {}).get("checks", [])),
        "proposal": state.get("proposal") if state.get("approval_card") else None,
        "approval": state.get("approval_card"),
        "orders": [],
        "fills": [],
        "ticket": None,
        "audit_positions": [],
        "trace": trace_document(steps, d.available_at),
    }
    # The zod schema decides: a document the panel would reject is a bug here, not at read time.
    Explain.model_validate(explain)
    return explain


def _waiting(node: str) -> Step:
    return Step(
        node=node,
        status="waiting",
        latency_ms=None,
        tokens_in=0,
        tokens_out=0,
        model_id=None,
        prompt_version=None,
        cached=False,
        parallel_group=None,
        note_tr=None,
    )
