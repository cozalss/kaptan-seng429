"""Live events (SSE) — owner: wave-2 package D.

    POST /sse/ticket                                     -> {"ticket"}  (all roles; 60 s, single use)
    GET  /stream/{feed|desk}?ticket=…&last_event_id=…    -> text/event-stream

EventSource cannot send headers: the ticket (Redis key, 60 s TTL, deleted on first use) carries the
caller. Each event: `event:` name, `data:` JSON (domain/schemas/events.py FEED_EVENTS / DESK_EVENTS),
`id:` Redis stream id; replay missed events with XRANGE after last_event_id; comment keep-alive
every 15 s. Publishers call the event-bus helper (package D) after their transaction commits.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query

from kaptan.api.deps import CurrentUser
from kaptan.api.errors import not_implemented
from kaptan.domain.schemas import SseTicketOut

router = APIRouter(tags=["sse"])


@router.post("/sse/ticket", response_model=SseTicketOut)
async def ticket(user: CurrentUser) -> Any:
    raise not_implemented("POST /sse/ticket")


@router.get("/stream/{stream}")
async def stream(
    stream: Literal["feed", "desk"],
    ticket: Annotated[str, Query(min_length=1, max_length=200)],
    last_event_id: Annotated[str | None, Query(max_length=64)] = None,
) -> Any:
    raise not_implemented("GET /stream/{stream}")
