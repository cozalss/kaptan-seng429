"""/healthz, /readyz, security headers and the request id on the real app (M3 A5)."""

from __future__ import annotations

from typing import Any

import httpx
import pytest
import redis.asyncio as aioredis

from kaptan.ops import health
from kaptan.ops.heartbeat import beat, clear, hb_key
from kaptan.settings import Settings
from tests.integration.ops_support import app_client

pytestmark = pytest.mark.integration


async def test_healthz_and_readyz_when_everything_is_up(client: httpx.AsyncClient) -> None:
    live = await client.get("/healthz")
    assert live.status_code == 200
    assert live.json() == {"status": "ok"}
    ready = await client.get("/readyz")
    assert ready.status_code == 200, ready.text
    body = ready.json()
    assert body["status"] == "ready"
    assert body["checks"] == {"db": "ok", "redis": "ok", "migrations": "ok"}
    assert set(body["workers"]) == {"ingest_worker", "agent_worker", "scheduler"}


async def test_the_old_health_endpoint_is_unchanged(client: httpx.AsyncClient) -> None:
    res = await client.get("/api/v1/health")
    assert res.status_code == 200
    assert set(res.json()) == {"status", "db", "redis", "demo_mode", "llm_mode", "now"}


async def test_readyz_reports_worker_heartbeats(client: httpx.AsyncClient, migrated: Settings) -> None:
    redis = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    try:
        await beat(redis, "agent_worker", state="draining")
        body = (await client.get("/readyz")).json()
        assert body["workers"]["agent_worker"]["status"] == "ok"
        assert body["workers"]["agent_worker"]["state"] == "draining"
        await redis.set(hb_key("scheduler"), "not json", ex=30)
        assert (await client.get("/readyz")).json()["workers"]["scheduler"] == {"status": "invalid"}
    finally:
        await clear(redis, "agent_worker")
        await clear(redis, "scheduler")
        await redis.aclose()


class DeadRedis:
    async def ping(self) -> bool:
        raise ConnectionError("redis down")

    async def aclose(self) -> None:
        return None


async def test_readyz_is_503_when_redis_is_down(migrated: Settings, seeded: object) -> None:
    async with app_client(migrated) as (http, app):
        real = app.state.redis
        app.state.redis = DeadRedis()
        try:
            res = await http.get("/readyz")
        finally:
            app.state.redis = real
    assert res.status_code == 503
    assert res.json()["checks"]["redis"] == "down"
    assert res.json()["status"] == "not_ready"


class DeadPool:
    def connection(self, timeout: float | None = None) -> Any:
        raise OSError("db down")


async def test_readyz_is_503_when_the_db_is_down_or_behind(
    migrated: Settings, seeded: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    async with app_client(migrated) as (http, app):
        real = app.state.pool
        app.state.pool = DeadPool()
        try:
            down = await http.get("/readyz")
        finally:
            app.state.pool = real
        monkeypatch.setattr(health, "code_heads", lambda: frozenset({"9999"}))
        behind = await http.get("/readyz")
    assert down.status_code == 503
    assert down.json()["checks"] == {"db": "down", "redis": "ok", "migrations": "unknown"}
    assert behind.status_code == 503
    assert behind.json()["checks"]["migrations"] == "ahead"  # the database has a revision this code lacks


def test_migration_state() -> None:
    assert health.migration_state(frozenset({"0017"}), frozenset({"0017"})) == "ok"
    assert health.migration_state(frozenset({"0016"}), frozenset({"0017"})) == "ahead"
    assert health.migration_state(frozenset(), frozenset({"0017"})) == "behind"


async def test_startup_logs_a_schema_behind_head(
    migrated: Settings, seeded: object, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(health, "code_heads", lambda: frozenset({"9999"}))
    with caplog.at_level("ERROR", logger="kaptan.ops.health"):
        async with app_client(migrated):
            pass
    assert any("run the migrate job" in r.getMessage() for r in caplog.records)
    assert await health.log_migration_state(DeadPool()) == "unknown"


async def test_security_headers_and_request_id(client: httpx.AsyncClient) -> None:
    res = await client.get("/api/v1/me")  # a 401 envelope gets them too
    assert res.status_code == 401
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["content-security-policy"] == "frame-ancestors 'none'"
    assert res.headers["referrer-policy"] == "no-referrer"
    assert "strict-transport-security" not in res.headers  # dev: no HSTS
    assert len(res.headers["x-request-id"]) == 32
    echoed = await client.get("/healthz", headers={"X-Request-ID": "panel-req-0001"})
    assert echoed.headers["x-request-id"] == "panel-req-0001"
    junk = await client.get("/healthz", headers={"X-Request-ID": "bad id with spaces"})
    assert junk.headers["x-request-id"] != "bad id with spaces"


async def test_hsts_only_in_prod(migrated: Settings, seeded: object, monkeypatch: pytest.MonkeyPatch) -> None:
    from kaptan.api import main

    monkeypatch.setattr(main, "ensure_production_ready", lambda *_a, **_k: None)
    s = migrated.model_copy(update={"kaptan_env": "prod", "hsts_max_age_s": 600})
    async with app_client(s) as (http, _):
        res = await http.get("/healthz")
    assert res.headers["strict-transport-security"] == "max-age=600; includeSubDomains"
