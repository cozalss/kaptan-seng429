"""GET /metrics: Prometheus text read from Postgres/Redis at scrape time, behind a token or loopback."""

from __future__ import annotations

import re
from typing import Any

import httpx
import pytest
import redis.asyncio as aioredis
from pydantic import SecretStr

from kaptan.ops import metrics
from kaptan.settings import Settings
from tests.integration.ops_support import app_client

pytestmark = pytest.mark.integration

TOKEN = "metrics-test-token-0123456789"


def value(text: str, name: str, labels: str = "") -> float:
    match = re.search(rf"^{re.escape(name + labels)} (\S+)$", text, re.M)
    assert match, f"{name}{labels} missing"
    return float(match.group(1))


async def test_metrics_from_loopback_without_a_token(client: httpx.AsyncClient, migrated: Settings) -> None:
    redis = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    try:
        await redis.delete(f"{metrics.WAF_COUNTER_PREFIX}poll")
        await metrics.incr_waf(redis, "poll")
        await metrics.incr_waf(redis, "poll")
        res = await client.get("/metrics")
    finally:
        await redis.delete(f"{metrics.WAF_COUNTER_PREFIX}poll")
        await redis.aclose()
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/plain")
    text = res.text
    assert value(text, "kaptan_kap_waf_blocks_total", '{loop="poll"}') == 2
    assert value(text, "kaptan_approvals_pending") >= 1  # the demo day has open cards
    assert value(text, "kaptan_audit_chain_ok") == 1
    assert value(text, "kaptan_metrics_scrape_errors") == 0
    for name in (
        "kaptan_kap_ingest_lag_seconds",
        "kaptan_agent_stream_pending",
        "kaptan_agent_dlq_length",
        "kaptan_graph_duration_seconds",
        "kaptan_llm_tokens_today",
        "kaptan_llm_quota_used",
        "kaptan_risk_rejects_24h",
        "kaptan_worker_heartbeat_age_seconds",
    ):
        assert f"\n{name}" in text, name


async def test_metrics_refuse_remote_clients_without_a_token(migrated: Settings, seeded: object) -> None:
    async with app_client(migrated, client=("203.0.113.9", 4000)) as (http, _):
        res = await http.get("/metrics")
    assert res.status_code == 403
    assert res.json()["code"] == "forbidden"


async def test_metrics_with_a_bearer_token(migrated: Settings, seeded: object) -> None:
    s = migrated.model_copy(update={"metrics_token": SecretStr(TOKEN)})
    async with app_client(s, client=("203.0.113.9", 4000)) as (http, _):
        none = await http.get("/metrics")
        wrong = await http.get("/metrics", headers={"Authorization": "Bearer nope"})
        ok = await http.get("/metrics", headers={"Authorization": f"Bearer {TOKEN}"})
    assert none.status_code == 401
    assert wrong.status_code == 401
    assert ok.status_code == 200
    assert TOKEN not in ok.text


async def test_the_audit_verdict_is_cached(migrated: Settings, seeded: object) -> None:
    async with app_client(migrated) as (_, app):
        assert await metrics.audit_ok(app, now=1000.0)
        app.state.audit_ok_cache = (1000.0, False)
        assert not await metrics.audit_ok(app, now=1000.0 + metrics.AUDIT_CACHE_S - 1)
        assert await metrics.audit_ok(app, now=1000.0 + metrics.AUDIT_CACHE_S + 1)


class BrokenPool:
    def connection(self, timeout: float | None = None) -> Any:
        raise OSError("db down")


async def test_a_broken_source_is_counted_not_fatal(migrated: Settings, seeded: object) -> None:
    async with app_client(migrated) as (http, app):
        real = app.state.pool
        app.state.pool = BrokenPool()
        try:
            res = await http.get("/metrics")
        finally:
            app.state.pool = real
    assert res.status_code == 200
    assert value(res.text, "kaptan_metrics_scrape_errors") == 2  # db + audit; redis still reported
    assert "kaptan_agent_stream_length" in res.text


async def test_pending_is_zero_without_a_group() -> None:
    class NoGroup:
        async def xpending(self, *_: Any) -> Any:
            raise RuntimeError("NOGROUP")

    assert await metrics._pending(NoGroup()) == 0
