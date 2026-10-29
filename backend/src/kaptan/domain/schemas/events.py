"""Mirror of kaptan-panel/src/lib/domain/events.ts (SSE event names and payloads, API.md §4).

The wire format is `event: <name>` + `data: <json>` + `id: <id>`. `DESK_EVENTS` / `FEED_EVENTS` map
each event name to the model of its `data`, so the SSE publisher (package D) can validate.
"""

from __future__ import annotations

from typing import Final, Literal

from pydantic import Field

from kaptan.domain.schemas._base import Confidence, IsoDateTime, KModel
from kaptan.domain.schemas.common import EventType
from kaptan.domain.schemas.crew import CrewActivity, CrewAgent
from kaptan.domain.schemas.disclosure import DayCounters, DisclosureListItem
from kaptan.domain.schemas.governance import LimitsView
from kaptan.domain.schemas.run import NodeName, RunOutcome, RunStatus
from kaptan.domain.schemas.trading import ApprovalCard, FillWithTicker, Order, OrderTicket, RiskStatus

StreamName = Literal["feed", "desk", "run"]


class ClassificationEvent(KModel):
    disclosure_index: int
    event_type: EventType
    confidence: Confidence


class NewsLinkedEvent(KModel):
    disclosure_index: int
    count: int


class CrewEvent(KModel):
    agent: CrewAgent
    activity: CrewActivity
    run_id: str | None
    ticker: str | None
    at: IsoDateTime


class NodeEvent(KModel):
    node: NodeName
    phase: Literal["start", "end"]
    at: IsoDateTime
    latency_ms: int | None
    tokens_in: int | None
    tokens_out: int | None


class ProgressEvent(KModel):
    pct: float = Field(ge=0, le=100)
    note_tr: str


class InterruptEvent(KModel):
    proposal_id: str


class DoneEvent(KModel):
    status: RunStatus
    outcome: RunOutcome | None


FEED_EVENTS: Final[dict[str, type[KModel]]] = {
    "disclosure": DisclosureListItem,
    "classification": ClassificationEvent,
    "news_linked": NewsLinkedEvent,
    "counters": DayCounters,
}

DESK_EVENTS: Final[dict[str, type[KModel]]] = {
    "approval.requested": ApprovalCard,
    "approval.decided": ApprovalCard,
    "order": Order,
    "fill": FillWithTicker,
    "kill_switch": RiskStatus,
    "halt": RiskStatus,
    "regime": RiskStatus,  # the daily regime changed (06 §9: normal ↔ crisis)
    "limits.changed": LimitsView,
    "ticket": OrderTicket,
    "crew": CrewEvent,
}

RUN_EVENTS: Final[dict[str, type[KModel]]] = {
    "node": NodeEvent,
    "progress": ProgressEvent,
    "interrupt": InterruptEvent,
    "done": DoneEvent,
}
