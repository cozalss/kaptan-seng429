"""Live events (SSE) — package D.

    POST /sse/ticket                                     -> {"ticket"}  (all roles; 60 s, single use)
    GET  /stream/{feed|desk}?ticket=…&last_event_id=…    -> text/event-stream
    GET  /stream/runs/{run_id}?ticket=…&last_event_id=…  -> text/event-stream (RUN_EVENTS)

EventSource cannot send headers: the ticket (Redis key, 60 s TTL, deleted on first use) carries the
caller. Each event: `id:` Redis stream id, `event:` name, `data:` JSON (domain/schemas/events.py);
missed events replay after `last_event_id` (query) or the `Last-Event-ID` header; a comment
keep-alive every 15 s. Publishers call `kaptan.events.publish` after their transaction commits.

Ticket auth: the Bearer access token when sent; otherwise the refresh cookie (the panel's SSE hook
calls `/sse/ticket` with `credentials: "include"` only). The cookie is only *looked up* (live, not
used, not revoked, not expired) — never rotated — and a cross-site `Origin` is refused.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Final, Literal

from fastapi import APIRouter, Header, Path, Query, Request
from fastapi.responses import StreamingResponse

from kaptan.api.deps import SettingsDep, bearer_token, current_user
from kaptan.api.errors import ApiError, unauthenticated
from kaptan.auth.tokens import refresh_token_hash
from kaptan.domain.roles import Role, is_role
from kaptan.domain.schemas import SseTicketOut
from kaptan.events import bus

router = APIRouter(tags=["sse"])

TICKET_INVALID: Final = "Canlı akış bileti geçersiz ya da kullanılmış."
LastEventId = Annotated[str | None, Query(max_length=64, pattern=bus.STREAM_ID.pattern)]
LastEventIdHeader = Annotated[str | None, Header(alias="Last-Event-ID", max_length=64)]
Ticket = Annotated[str, Query(min_length=1, max_length=200)]

_LIVE_REFRESH = (
    "SELECT uid, role FROM auth.refresh_tokens "
    "WHERE token_hash = %s AND used_at IS NULL AND revoked_at IS NULL AND expires_at > %s"
)


async def _holder_from_cookie(request: Request, settings: SettingsDep) -> tuple[str, Role]:
    origin = request.headers.get("origin")
    if origin and settings.allowed_origins and origin not in settings.allowed_origins:
        raise ApiError(403, "forbidden", "İstek kaynağı tanınmadı.")
    token = request.cookies.get(settings.refresh_cookie_name)
    if not token:
        raise unauthenticated()
    async with request.app.state.pool.connection() as conn, conn.cursor() as cur:
        await cur.execute(_LIVE_REFRESH, (refresh_token_hash(token), datetime.now(UTC)))
        row = await cur.fetchone()
    if row is None or not is_role(row["role"]):
        raise unauthenticated()
    return str(row["uid"]), row["role"]


@router.post("/sse/ticket", response_model=SseTicketOut)
async def ticket(request: Request, settings: SettingsDep) -> Any:
    if bearer_token(request) is not None:
        actor = await current_user(request, settings)
        uid, role = actor.uid, actor.role
    else:
        uid, role = await _holder_from_cookie(request, settings)
    return {"ticket": await bus.issue_ticket(request.app.state.redis, uid, role)}


async def _open(request: Request, stream: str, ticket: str, last_event_id: str | None) -> StreamingResponse:
    redis = request.app.state.redis
    if await bus.redeem_ticket(redis, ticket) is None:
        raise unauthenticated(TICKET_INVALID)
    body = bus.frames(redis, stream, last_event_id=last_event_id, is_disconnected=request.is_disconnected)
    return StreamingResponse(
        body,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


def _resume_from(query_id: str | None, header_id: str | None) -> str | None:
    if query_id:
        return query_id
    return header_id if header_id and bus.is_stream_id(header_id) else None


@router.get("/stream/runs/{run_id}")
async def run_stream(
    request: Request,
    run_id: Annotated[str, Path(pattern=bus.RUN_ID.pattern)],
    ticket: Ticket,
    last_event_id: LastEventId = None,
    last_event_id_header: LastEventIdHeader = None,
) -> StreamingResponse:
    return await _open(request, f"run:{run_id}", ticket, _resume_from(last_event_id, last_event_id_header))


@router.get("/stream/{stream}")
async def stream(
    request: Request,
    stream: Literal["feed", "desk"],
    ticket: Ticket,
    last_event_id: LastEventId = None,
    last_event_id_header: LastEventIdHeader = None,
) -> StreamingResponse:
    return await _open(request, stream, ticket, _resume_from(last_event_id, last_event_id_header))
