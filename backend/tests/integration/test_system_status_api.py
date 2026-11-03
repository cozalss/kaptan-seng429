"""GET /api/v1/system/status reads what the workers really did (Redis, ops.job_runs) and needs a session."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest
import redis.asyncio as aioredis

from kaptan.db import connect
from kaptan.ops.heartbeat import LAST_POLL_KEY, beat, clear, note_poll
from kaptan.settings import Settings
from tests.conftest import DEMO_PASSPHRASE, bearer

pytestmark = pytest.mark.integration

URL = "/api/v1/system/status"
WORKERS = ("ingest_worker", "agent_worker", "scheduler")
MARKS = ("backup", "live_warmup")


async def _headers(client: httpx.AsyncClient) -> dict[str, str]:
    res = await client.post("/api/v1/auth/login", json={"passphrase": DEMO_PASSPHRASE})
    assert res.status_code == 200, res.text
    return bearer(res.json()["access_token"])


async def _marks(settings: Settings, rows: list[tuple[str, datetime, datetime | None, bool | None]]) -> None:
    assert settings.database_owner_url is not None
    conn = await connect(settings.database_owner_url.get_secret_value(), autocommit=True)
    try:
        await conn.execute("DELETE FROM ops.job_runs WHERE job = ANY(%s)", (list(MARKS),))
        for job, started, finished, ok in rows:
            await conn.execute(
                "INSERT INTO ops.job_runs (job, slot, trigger, started_at, finished_at, ok) "
                "VALUES (%s, '2026-11-03', 'manual', %s, %s, %s)",
                (job, started, finished, ok),
            )
    finally:
        await conn.close()


async def _quiet(redis: aioredis.Redis) -> None:
    for name in WORKERS:
        await clear(redis, name)
    await redis.delete(LAST_POLL_KEY)


async def test_it_needs_a_session(client: httpx.AsyncClient) -> None:
    assert (await client.get(URL)).status_code == 401


async def test_nothing_running_says_kaptan_is_not_reading(client: httpx.AsyncClient, migrated: Settings) -> None:
    redis = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    try:
        await _quiet(redis)
        await _marks(migrated, [])
        doc = (await client.get(URL, headers=await _headers(client))).json()
    finally:
        await redis.aclose()
    assert doc["reading"] is False
    assert doc["message"] == "KAPtan şu an bildirim okumuyor."
    assert [p["code"] for p in doc["problems"]] == ["ingest_down", "agents_down", "scheduler_down", "backup_never"]


async def test_workers_alive_and_a_fresh_backup_is_all_clear(client: httpx.AsyncClient, migrated: Settings) -> None:
    now = datetime.now(UTC)
    redis = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    try:
        for name in WORKERS:
            await beat(redis, name)
        await note_poll(redis)
        await _marks(migrated, [("backup", now - timedelta(minutes=5), now - timedelta(minutes=4), True)])
        doc = (await client.get(URL, headers=await _headers(client))).json()
    finally:
        await _quiet(redis)
        await redis.aclose()
        await _marks(migrated, [])
    assert doc["reading"] is True and doc["message"] is None and doc["problems"] == []
    assert doc["ingest"]["ok"] is True and doc["ingest"]["age_s"] < 60
    assert doc["backup"]["ok"] is True and doc["backup"]["age_h"] == 0.1


async def test_a_failed_backup_does_not_count_and_a_warm_up_in_progress_is_named(
    client: httpx.AsyncClient, migrated: Settings
) -> None:
    now = datetime.now(UTC)
    redis = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    try:
        await _quiet(redis)
        await _marks(
            migrated,
            [("backup", now, now, False), ("live_warmup", now - timedelta(minutes=3), None, None)],
        )
        doc = (await client.get(URL, headers=await _headers(client))).json()
    finally:
        await redis.aclose()
        await _marks(migrated, [])
    codes = [p["code"] for p in doc["problems"]]
    assert "backup_never" in codes and "warming_up" in codes and "agents_down" not in codes
