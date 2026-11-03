"""The SSE events of one finished run, in order.

Node start/end on `run:<run_id>` and crew activity on `desk`, one slice per trace node; then the classification
(feed), the approval card (desk), interrupt and done (run) and fresh counters. `at_ms` only keeps that order: a real
run already took its time, so kaptan.agents.feed_run sends them all at once.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final, get_args

from kaptan.domain.schemas.crew import CrewAgent

RUN_SPAN_MS: Final = 7_500
END_GAP_MS: Final = 40
DONE_AFTER_MS: Final = RUN_SPAN_MS + 50
CREW: Final = frozenset(get_args(CrewAgent))


@dataclass(frozen=True, slots=True)
class TimedEvent:
    at_ms: int
    stream: str
    event: str
    data: dict[str, Any] | None  # None + event "counters" → recomputed when it fires
    stamp: bool = False  # set data["at"] to now when it is sent


def plan(explain: dict[str, Any]) -> list[TimedEvent]:
    """The ordered events of one run (pure; the sender adds the clock)."""
    run = explain["run"]
    run_id, ticker = run["run_id"], run["ticker"]
    stream = f"run:{run_id}"
    nodes = explain["trace"]["nodes"]
    part = RUN_SPAN_MS // max(1, len(nodes))
    events: list[TimedEvent] = []
    for i, n in enumerate(nodes):
        start = {"node": n["node"], "phase": "start", "latency_ms": None, "tokens_in": None, "tokens_out": None}
        end = {**start, "phase": "end", "latency_ms": n["latency_ms"], "tokens_in": n["tokens_in"]}
        end["tokens_out"] = n["tokens_out"]
        events.append(TimedEvent(i * part, stream, "node", start, stamp=True))
        events.append(TimedEvent((i + 1) * part - END_GAP_MS, stream, "node", end, stamp=True))
        if n["node"] in CREW:
            working = {"agent": n["node"], "activity": "working", "run_id": run_id, "ticker": ticker}
            events.append(TimedEvent(i * part, "desk", "crew", working, stamp=True))
            idle = {**working, "activity": "idle", "run_id": None}
            events.append(TimedEvent((i + 1) * part - END_GAP_MS, "desk", "crew", idle, stamp=True))
    c = explain.get("classifier")
    if c is not None:
        cls = {
            "disclosure_index": run["disclosure_index"],
            "event_type": c["event_type"],
            "confidence": c["confidence"],
        }
        events.append(TimedEvent(DONE_AFTER_MS, "feed", "classification", cls))
    card = explain.get("approval")
    if card is not None:
        events.append(TimedEvent(DONE_AFTER_MS, stream, "interrupt", {"proposal_id": card["proposal_id"]}))
        events.append(TimedEvent(DONE_AFTER_MS, "desk", "approval.requested", card))
    events.append(TimedEvent(DONE_AFTER_MS, stream, "done", {"status": run["status"], "outcome": run["outcome"]}))
    events.append(TimedEvent(DONE_AFTER_MS, "feed", "counters", None))
    return sorted(events, key=lambda e: e.at_ms)
