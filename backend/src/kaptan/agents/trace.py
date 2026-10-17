"""The run's trace (TraceNode rows) on a virtual timeline: started_at = available_at + latencies so far.

Nodes of one parallel group start together and the timeline advances by the slowest of them; a
waiting node (the human approval) has no latency. Steps arrive in execution order except inside a
`Send` super-step, so they are sorted by the graph's canonical node order first.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any, Final

from kaptan.agents.state import Step
from kaptan.domain.schemas._base import iso_ms

NODE_ORDER: Final = (
    "route",
    "pre_gate",
    "guard",
    "classifier",
    "reader",
    "materiality",
    "evidence",
    "merge",
    "skeptic",
    "rule_engine",
    "compliance",
    "risk_gate",
    "request_approval",
    "approval",
    "execute",
    "filter_action",
    "record",
)


def ordered(steps: Sequence[Step]) -> list[Step]:
    return sorted(steps, key=lambda s: NODE_ORDER.index(s["node"]))


def timeline(steps: Sequence[Step], start: datetime) -> list[tuple[Step, datetime]]:
    """Each step with its virtual start time."""
    out: list[tuple[Step, datetime]] = []
    cursor = start
    group: str | None = None
    group_start = start
    group_max = 0
    for s in ordered(steps):
        g = s["parallel_group"]
        if g is not None and g == group:
            out.append((s, group_start))
            group_max = max(group_max, s["latency_ms"] or 0)
            continue
        if group is not None:  # the previous group ended
            cursor = group_start + timedelta(milliseconds=group_max)
            group = None
        if g is not None:
            group, group_start, group_max = g, cursor, s["latency_ms"] or 0
            out.append((s, cursor))
            continue
        out.append((s, cursor))
        cursor += timedelta(milliseconds=s["latency_ms"] or 0)
    return out


def elapsed_until_now(steps: Sequence[Step], start: datetime) -> datetime:
    """Virtual time right after the last step (where the next node starts)."""
    rows = timeline(steps, start)
    if not rows:
        return start
    end = start
    for s, at in rows:
        end = max(end, at + timedelta(milliseconds=s["latency_ms"] or 0))
    return end


def trace_document(steps: Sequence[Step], start: datetime) -> dict[str, Any]:
    nodes = [
        {
            "node": s["node"],
            "status": s["status"],
            "started_at": iso_ms(at),
            "latency_ms": s["latency_ms"],
            "tokens_in": s["tokens_in"],
            "tokens_out": s["tokens_out"],
            "model_id": s["model_id"],
            "prompt_version": s["prompt_version"],
            "cached": s["cached"],
            "parallel_group": s["parallel_group"],
            "note_tr": s["note_tr"],
        }
        for s, at in timeline(steps, start)
    ]
    return {"nodes": nodes, "langsmith_url": None}
