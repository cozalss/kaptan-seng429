"""The injected run's live animation (scenarios.ts runDemoScenario): SSE events spread over DEMO_RUN_MS.

Node start/end on `run:<run_id>` and crew activity on `desk`, one slice per trace node; when the run
"finishes" (DEMO_RUN_MS + 50 ms): the classification (feed), the approval card (desk), interrupt and
done (run) and fresh counters. Every event is a demo timer (kaptan.demo.timers) so reset/shutdown
cancel it; publishing goes through package D's `publish()`.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Final, get_args

from kaptan.domain.schemas._base import iso_ms
from kaptan.domain.schemas.crew import CrewAgent

log = logging.getLogger("kaptan.agents.timeline")

DEMO_RUN_MS: Final = 7_500
END_GAP_MS: Final = 40
DONE_AFTER_MS: Final = DEMO_RUN_MS + 50
CREW: Final = frozenset(get_args(CrewAgent))


@dataclass(frozen=True, slots=True)
class TimedEvent:
    at_ms: int
    stream: str
    event: str
    data: dict[str, Any] | None  # None + event "counters" → recomputed when it fires
    stamp: bool = False  # set data["at"] to the demo clock when it fires


def plan(explain: dict[str, Any]) -> list[TimedEvent]:
    """The ordered events of one run (pure; the scheduler adds the clock)."""
    run = explain["run"]
    run_id, ticker = run["run_id"], run["ticker"]
    stream = f"run:{run_id}"
    nodes = explain["trace"]["nodes"]
    part = DEMO_RUN_MS // max(1, len(nodes))
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


Publisher = Callable[[Any, str, str, Any], Awaitable[Any]]


async def fire(app: Any, ev: TimedEvent, publisher: Publisher | None = None) -> None:
    if ev.event == "counters" and ev.data is None:
        from kaptan.disclosures.counters import publish_counters

        await publish_counters(app)
        return
    if publisher is None:
        from kaptan.events.publish import publish

        publisher = publish
    data = ev.data or {}
    if ev.stamp:
        data = {**data, "at": iso_ms(app.state.clock.now())}
    await publisher(app, ev.stream, ev.event, data)


def schedule(app: Any, explain: dict[str, Any]) -> int:
    """Hand every event to the demo timers; returns how many were scheduled."""
    from kaptan.demo.timers import later

    events = plan(explain)
    run_id = explain["run"]["run_id"]
    for i, ev in enumerate(events):

        async def _go(ev: TimedEvent = ev) -> None:
            await fire(app, ev)

        later(app, ev.at_ms / 1000, _go, name=f"run:{run_id}:{i}:{ev.event}")
    return len(events)
