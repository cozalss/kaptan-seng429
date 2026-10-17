"""Redis side of the live events: stream keys, single-use SSE tickets, and the SSE frame reader.

Streams: `kaptan:feed`, `kaptan:desk` and `kaptan:run:<run_id>` (Redis streams, MAXLEN ~1000). Each
entry has two fields, `event` (the SSE event name) and `data` (the validated JSON payload); the
entry id ("1736592000000-0") is the SSE `id:`, so a reconnect with `last_event_id` resumes with
XREAD right after it (Redis returns entries strictly newer than the given id).

Tickets: EventSource cannot send an Authorization header, so `POST /sse/ticket` stores
`kaptan:sse:<ticket>` = "<uid>,<role>" for 60 s and the stream route consumes it with GETDEL
(atomic, single use: a second use is 401).
"""

from __future__ import annotations

import logging
import re
import secrets
import time
from collections.abc import AsyncGenerator, Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Final

from redis.asyncio import Redis

from kaptan.domain.roles import Role, is_role

log = logging.getLogger("kaptan.events")

KEY_PREFIX: Final = "kaptan:"
TICKET_PREFIX: Final = f"{KEY_PREFIX}sse:"
TICKET_TTL_S: Final = 60
STREAM_MAXLEN: Final = 1000
#: Run streams are per run; they expire a day after their last event.
RUN_STREAM_TTL_S: Final = 24 * 60 * 60
KEEPALIVE_S: Final = 15.0
READ_COUNT: Final = 100

STREAM_ID = re.compile(r"^\d{1,20}-\d{1,20}$")
RUN_ID = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
_START: Final = "0-0"


def _text(value: Any) -> str:
    """Redis replies as str (the app client uses decode_responses=True); bytes are decoded defensively."""
    return value.decode() if isinstance(value, bytes) else str(value)


def stream_key(stream: str) -> str:
    """`feed` / `desk` / `run:<run_id>` -> the Redis key; anything else is a programming error."""
    if stream in ("feed", "desk"):
        return f"{KEY_PREFIX}{stream}"
    kind, sep, run_id = stream.partition(":")
    if kind == "run" and sep and RUN_ID.match(run_id):
        return f"{KEY_PREFIX}run:{run_id}"
    raise ValueError(f"unknown event stream {stream!r}")


def is_stream_id(value: str) -> bool:
    return bool(STREAM_ID.match(value))


async def append(redis: Redis, stream: str, event: str, data_json: str) -> str:
    """XADD one already-validated event; returns its id (the SSE `id:`)."""
    key = stream_key(stream)
    entry_id = _text(await redis.xadd(key, {"event": event, "data": data_json}, maxlen=STREAM_MAXLEN, approximate=True))
    if stream.startswith("run:"):
        await redis.expire(key, RUN_STREAM_TTL_S)
    return entry_id


# ── tickets ──────────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class TicketHolder:
    uid: str
    role: Role


async def issue_ticket(redis: Redis, uid: str, role: Role) -> str:
    ticket = secrets.token_urlsafe(32)
    await redis.set(f"{TICKET_PREFIX}{ticket}", f"{uid},{role}", ex=TICKET_TTL_S)
    return ticket


async def redeem_ticket(redis: Redis, ticket: str) -> TicketHolder | None:
    """The ticket's holder, deleting it (GETDEL); None when unknown, expired or already used."""
    value = await redis.getdel(f"{TICKET_PREFIX}{ticket}")
    if value is None:
        return None
    raw = _text(value)
    uid, _, role = raw.partition(",")
    if not uid or not is_role(role):
        log.warning("sse ticket with a malformed value ignored")
        return None
    return TicketHolder(uid=uid, role=role)


# ── reading ──────────────────────────────────────────────────────────────────


def sse_frame(entry_id: str, event: str, data: str) -> str:
    """One SSE message. `data` is compact single-line JSON, so one `data:` line is enough."""
    return f"id: {entry_id}\nevent: {event}\ndata: {data}\n\n"


def comment_frame(text: str) -> str:
    return f": {text}\n\n"


async def latest_id(redis: Redis, key: str) -> str:
    """The newest entry id of a stream, or 0-0 when it is empty (so the next XREAD gets everything new)."""
    rows = await redis.xrevrange(key, count=1)
    return _text(rows[0][0]) if rows else _START


async def frames(
    redis: Redis,
    stream: str,
    *,
    last_event_id: str | None,
    is_disconnected: Callable[[], Awaitable[bool]],
    keepalive_s: float = KEEPALIVE_S,
    clock: Callable[[], float] = time.monotonic,
) -> AsyncGenerator[str, None]:
    """SSE text for a stream: replay after `last_event_id` (if given), then live events via XREAD BLOCK.

    A comment frame opens the stream (proxies flush headers) and repeats every `keepalive_s` without
    events. Stops when `is_disconnected()` says so; cancellation (client gone) ends the XREAD too.
    """
    key = stream_key(stream)
    cursor = last_event_id if last_event_id and is_stream_id(last_event_id) else await latest_id(redis, key)
    yield comment_frame("ok")
    last_beat = clock()
    block_ms = max(1, int(keepalive_s * 1000))
    while not await is_disconnected():
        reply: Any = await redis.xread({key: cursor}, count=READ_COUNT, block=block_ms)
        for _key, entries in reply or []:
            for raw_id, raw_fields in entries:
                entry_id = cursor = _text(raw_id)
                fields = {_text(k): _text(v) for k, v in (raw_fields or {}).items()}
                event, data = fields.get("event"), fields.get("data")
                if event is None or data is None:
                    log.warning("stream %s entry %s without event/data skipped", key, entry_id)
                    continue
                yield sse_frame(entry_id, event, data)
                last_beat = clock()
        if clock() - last_beat >= keepalive_s:
            yield comment_frame("keep-alive")
            last_beat = clock()
