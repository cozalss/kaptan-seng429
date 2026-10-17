"""`publish()`: validate an event against the panel's schema and append it to its Redis stream.

    await publish(request.app, "desk", "approval.decided", card)      # card: dict or ApprovalCard
    await publish(app.state.redis, "feed", "counters", counters)
    await publish(request, "run:run-demo-e3-ornek", "node", {...})

Call it **after** the transaction commits (a rolled-back write must not reach the panel).
`stream` is "feed", "desk" or "run:<run_id>"; `event` must be one of FEED_EVENTS / DESK_EVENTS /
RUN_EVENTS (domain/schemas/events.py) and `data` must validate against that model; both are
programming errors (ValueError / pydantic ValidationError) and raise. A Redis outage does not undo
the committed write: it is logged with the event name and `publish` returns None.
"""

from __future__ import annotations

import logging
from typing import Any, Final, Protocol

from redis.asyncio import Redis
from redis.exceptions import RedisError
from starlette.requests import HTTPConnection

from kaptan.domain.schemas._base import KModel
from kaptan.domain.schemas.events import DESK_EVENTS, FEED_EVENTS, RUN_EVENTS
from kaptan.events import bus

log = logging.getLogger("kaptan.events")

_EVENTS: Final[dict[str, dict[str, type[KModel]]]] = {"feed": FEED_EVENTS, "desk": DESK_EVENTS, "run": RUN_EVENTS}


class _HasState(Protocol):
    """A FastAPI/Starlette app (its `state.redis` is created in the lifespan)."""

    @property
    def state(self) -> Any: ...


Target = Redis | HTTPConnection | _HasState


def redis_of(target: Target) -> Redis:
    """The Redis client behind an app, a request/websocket, or a client passed directly."""
    if isinstance(target, Redis):
        return target
    if isinstance(target, HTTPConnection):
        client: Redis = target.app.state.redis
        return client
    client = target.state.redis
    return client


def model_for(stream: str, event: str) -> type[KModel]:
    bus.stream_key(stream)  # validates the stream name
    kind = stream.partition(":")[0]
    model = _EVENTS[kind].get(event)
    if model is None:
        raise ValueError(f"event {event!r} is not part of the {kind} stream")
    return model


def encode(stream: str, event: str, data: Any) -> str:
    """The `data:` JSON exactly as the panel's zod schema expects (ISO-ms times, field names as-is)."""
    model = model_for(stream, event)
    value = data if isinstance(data, model) else model.model_validate(data)
    return value.model_dump_json(by_alias=True)


async def publish(target: Target, stream: str, event: str, data: Any) -> str | None:
    """Append one event; returns its stream id (the SSE `id:`), or None if Redis is unreachable."""
    payload = encode(stream, event, data)
    try:
        return await bus.append(redis_of(target), stream, event, payload)
    except (RedisError, OSError):
        log.exception("sse publish failed: stream=%s event=%s", stream, event)
        return None
