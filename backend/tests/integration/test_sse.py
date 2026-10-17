"""SSE + Redis event bus (package D): tickets, replay, keep-alive, disconnect, and a real streaming server.

The streaming tests run uvicorn in-process on 127.0.0.1:8004 (httpx's ASGITransport buffers whole
responses, so it cannot read an endless stream). Package A's decide endpoint is not wired yet, so
"an approval decided appears on /stream/desk within 1 s" publishes the event directly.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import redis.asyncio as aioredis
import uvicorn
from fastapi import FastAPI

from kaptan.api.deps import settings_dep
from kaptan.api.main import API_PREFIX, create_app
from kaptan.demo.seed import SeedResult
from kaptan.events import bus
from kaptan.events.publish import publish
from kaptan.settings import Settings
from tests.conftest import bearer, login
from tests.contract.harness import assert_matches

pytestmark = pytest.mark.integration

PORT = 8004
EXPECTED = Path(__file__).resolve().parents[1] / "fixtures" / "demo" / "expected"
CARD: dict[str, Any] = json.loads((EXPECTED / "approvals_all.json").read_text(encoding="utf-8"))[0]
COUNTERS: dict[str, Any] = json.loads((EXPECTED / "counters.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
async def redis(migrated: Settings) -> AsyncIterator[aioredis.Redis]:
    client = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    try:
        await asyncio.wait_for(client.ping(), timeout=3)
    except Exception as exc:
        await client.aclose()
        pytest.skip(f"compose Redis unreachable: {exc}")
    yield client
    await client.aclose()


def _run_stream() -> str:
    return f"run:test-{uuid.uuid4().hex[:12]}"


async def _never() -> bool:
    return False


# ── bus.frames() directly ───────────────────────────────────────────────────


async def test_frames_replay_after_the_last_id_then_go_live(redis: aioredis.Redis) -> None:
    stream = _run_stream()
    first = await publish(redis, stream, "progress", {"pct": 10, "note_tr": "bir"})
    second = await publish(redis, stream, "progress", {"pct": 20, "note_tr": "iki"})
    assert first and second
    gen = bus.frames(redis, stream, last_event_id=first, is_disconnected=_never, keepalive_s=5)
    assert await anext(gen) == ": ok\n\n"
    replayed = await anext(gen)
    assert replayed.startswith(f"id: {second}\nevent: progress\n")
    assert json.loads(replayed.split("data: ", 1)[1]) == {"pct": 20.0, "note_tr": "iki"}
    pending = asyncio.ensure_future(anext(gen))
    await asyncio.sleep(0.05)
    third = await publish(redis, stream, "done", {"status": "completed", "outcome": "PROPOSE"})
    live = await asyncio.wait_for(pending, timeout=1)
    assert live.startswith(f"id: {third}\nevent: done\n")
    await gen.aclose()


async def test_frames_without_last_id_start_at_now(redis: aioredis.Redis) -> None:
    stream = _run_stream()
    await publish(redis, stream, "progress", {"pct": 1, "note_tr": "eski"})
    gen = bus.frames(redis, stream, last_event_id=None, is_disconnected=_never, keepalive_s=5)
    await anext(gen)
    pending = asyncio.ensure_future(anext(gen))
    await asyncio.sleep(0.05)
    new = await publish(redis, stream, "progress", {"pct": 2, "note_tr": "yeni"})
    assert (await asyncio.wait_for(pending, timeout=1)).startswith(f"id: {new}\n")
    await gen.aclose()


async def test_frames_keep_alive_skip_malformed_and_stop_on_disconnect(redis: aioredis.Redis) -> None:
    stream = _run_stream()
    gone = False

    async def disconnected() -> bool:
        return gone

    gen = bus.frames(redis, stream, last_event_id=None, is_disconnected=disconnected, keepalive_s=0.2)
    await anext(gen)
    await redis.xadd(bus.stream_key(stream), {"event": "progress"})  # no data: skipped, not sent
    assert await asyncio.wait_for(anext(gen), timeout=2) == ": keep-alive\n\n"
    gone = True
    with pytest.raises(StopAsyncIteration):
        await asyncio.wait_for(anext(gen), timeout=2)


async def test_a_quiet_stream_outlives_the_redis_socket_timeout(migrated: Settings) -> None:
    """Regression (wave 3): XREAD BLOCK = keep-alive (15 s) > redis-py's 5 s socket timeout cut every
    quiet SSE stream after 5 s (ERR_INCOMPLETE_CHUNKED_ENCODING in the panel). The BLOCK is sliced."""
    short = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True, socket_timeout=2)
    try:
        gen = bus.frames(short, _run_stream(), last_event_id=None, is_disconnected=_never, keepalive_s=4)
        assert await anext(gen) == ": ok\n\n"
        # 4 s of silence = two socket timeouts; the keep-alive must still arrive (unsliced: TimeoutError).
        assert await asyncio.wait_for(anext(gen), timeout=8) == ": keep-alive\n\n"
        await gen.aclose()
    finally:
        await short.aclose()
    assert bus.XREAD_BLOCK_MS < 5000


async def test_run_streams_are_capped_and_expire(redis: aioredis.Redis) -> None:
    stream = _run_stream()
    await publish(redis, stream, "progress", {"pct": 5, "note_tr": "x"})
    ttl = await redis.ttl(bus.stream_key(stream))
    assert 0 < ttl <= bus.RUN_STREAM_TTL_S


# ── tickets over the ASGI client ────────────────────────────────────────────


async def test_ticket_is_single_use(client: httpx.AsyncClient, redis: aioredis.Redis) -> None:
    session = await login(client, "auditor")
    res = await client.post(f"{API_PREFIX}/sse/ticket", headers=bearer(session["access_token"]))
    assert res.status_code == 200
    ticket = res.json()["ticket"]
    assert set(res.json()) == {"ticket"}
    assert 0 < await redis.ttl(f"{bus.TICKET_PREFIX}{ticket}") <= bus.TICKET_TTL_S
    holder = await bus.redeem_ticket(redis, ticket)
    assert holder == bus.TicketHolder(uid=session["user"]["id"], role="auditor")
    assert await bus.redeem_ticket(redis, ticket) is None
    used = await client.get(f"{API_PREFIX}/stream/desk", params={"ticket": ticket})
    assert used.status_code == 401
    assert used.json() == {"detail": "Canlı akış bileti geçersiz ya da kullanılmış.", "code": "unauthenticated"}


async def test_ticket_from_the_refresh_cookie(client: httpx.AsyncClient, redis: aioredis.Redis) -> None:
    session = await login(client, "analyst")  # sets __Host-kaptan_rt in the client's jar
    res = await client.post(f"{API_PREFIX}/sse/ticket")
    assert res.status_code == 200, res.text
    holder = await bus.redeem_ticket(redis, res.json()["ticket"])
    assert holder is not None
    assert (holder.uid, holder.role) == (session["user"]["id"], "analyst")
    foreign = await client.post(f"{API_PREFIX}/sse/ticket", headers={"Origin": "https://evil.example"})
    assert foreign.status_code == 403
    client.cookies.clear()
    assert (await client.post(f"{API_PREFIX}/sse/ticket")).status_code == 401
    bad = await client.post(f"{API_PREFIX}/sse/ticket", headers={"Authorization": "Bearer nope"})
    assert bad.status_code == 401


async def test_stream_validates_its_inputs(client: httpx.AsyncClient) -> None:
    assert (await client.get(f"{API_PREFIX}/stream/desk")).status_code == 422
    assert (await client.get(f"{API_PREFIX}/stream/audit", params={"ticket": "x"})).status_code == 422
    bad_id = await client.get(f"{API_PREFIX}/stream/feed", params={"ticket": "x", "last_event_id": "$"})
    assert bad_id.status_code == 422
    unknown = await client.get(f"{API_PREFIX}/stream/runs/run-x", params={"ticket": "nope"})
    assert unknown.status_code == 401


# ── a real streaming server ─────────────────────────────────────────────────


@pytest.fixture(scope="session")
async def live_app(seeded: SeedResult, migrated: Settings) -> AsyncIterator[FastAPI]:
    app = create_app(migrated)
    app.dependency_overrides[settings_dep] = lambda: migrated
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, loop="none", log_level="warning"))
    task = asyncio.create_task(server.serve())
    for _ in range(100):
        if server.started:
            break
        await asyncio.sleep(0.05)
    if not server.started:
        task.cancel()
        pytest.skip(f"could not start uvicorn on port {PORT}")
    yield app
    server.should_exit = True
    await asyncio.wait_for(task, timeout=20)


async def _ticket(http: httpx.AsyncClient, token: str) -> str:
    res = await http.post(f"{API_PREFIX}/sse/ticket", headers=bearer(token))
    assert res.status_code == 200, res.text
    ticket: str = res.json()["ticket"]
    return ticket


async def _next_event(lines: AsyncIterator[str]) -> dict[str, str]:
    """The next non-comment SSE message as {id, event, data}."""
    msg: dict[str, str] = {}
    async for line in lines:
        if not line:
            if msg:
                return msg
            continue
        if line.startswith(":"):
            continue
        field, _, value = line.partition(": ")
        msg[field] = value
    raise AssertionError("stream ended")


async def test_decided_card_reaches_the_desk_within_a_second_and_replays(live_app: FastAPI) -> None:
    async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{PORT}", timeout=10) as http:
        session = await login(http, "risk_officer")
        token = session["access_token"]
        params = {"ticket": await _ticket(http, token)}
        async with http.stream("GET", f"{API_PREFIX}/stream/desk", params=params) as res:
            assert res.status_code == 200
            assert res.headers["content-type"].startswith("text/event-stream")
            assert res.headers["cache-control"].startswith("no-cache")
            lines = res.aiter_lines()
            assert await anext(lines) == ": ok"
            started = time.perf_counter()
            decided = {**CARD, "status": "approved"}
            entry_id = await publish(live_app, "desk", "approval.decided", decided)
            assert entry_id is not None
            msg = await asyncio.wait_for(_next_event(lines), timeout=1)
            assert time.perf_counter() - started < 1
        assert msg["id"] == entry_id
        assert msg["event"] == "approval.decided"
        assert_matches("DeskEvent", {"event": msg["event"], "data": json.loads(msg["data"])})

        # Disconnected: desk + feed events happen; the desk reconnect with the last id replays its own, in order.
        missed = [
            await publish(live_app, "desk", "halt", json.loads((EXPECTED / "risk_status.json").read_text("utf-8"))),
            await publish(live_app.state.redis, "feed", "counters", COUNTERS),
        ]
        await publish(
            live_app, "desk", "limits.changed", json.loads((EXPECTED / "limits_view.json").read_text("utf-8"))
        )
        params = {"ticket": await _ticket(http, token), "last_event_id": entry_id}
        async with http.stream("GET", f"{API_PREFIX}/stream/desk", params=params) as res:
            lines = res.aiter_lines()
            first = await asyncio.wait_for(_next_event(lines), timeout=1)
            second = await asyncio.wait_for(_next_event(lines), timeout=1)
        assert (first["id"], first["event"]) == (missed[0], "halt")
        assert second["event"] == "limits.changed"  # the feed event lives on the feed stream

        # The browser's own reconnect sends Last-Event-ID instead of the query parameter.
        headers = {"Last-Event-ID": entry_id}
        async with http.stream(
            "GET", f"{API_PREFIX}/stream/desk", params={"ticket": await _ticket(http, token)}, headers=headers
        ) as res:
            again = await asyncio.wait_for(_next_event(res.aiter_lines()), timeout=1)
        assert again["id"] == missed[0]

        # Feed stream: the counters event is there for a client that resumes before it.
        feed_from = await publish(live_app, "feed", "counters", COUNTERS)
        assert feed_from is not None
        await publish(live_app, "feed", "counters", {**COUNTERS, "total": COUNTERS["total"] + 1})
        params = {"ticket": await _ticket(http, token), "last_event_id": feed_from}
        async with http.stream("GET", f"{API_PREFIX}/stream/feed", params=params) as res:
            feed = await asyncio.wait_for(_next_event(res.aiter_lines()), timeout=1)
        assert feed["event"] == "counters"
        assert json.loads(feed["data"])["total"] == COUNTERS["total"] + 1
