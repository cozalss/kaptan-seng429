"""Live LLM mode against the compose services (vendors mocked with respx, never called):
the Redis store, and an injected demo scenario run on the live chain that lands its usage
in trading.llm_usage and the real counters in trading.quota_usage (the panel's risk card)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
import respx
from redis.asyncio import Redis
from redis.exceptions import RedisError

from kaptan.agents import run_scenario
from kaptan.clock import Clock
from kaptan.db import DictConn
from kaptan.llm.factory import build_live_provider
from kaptan.llm.live import LiveProvider, UsageEvent
from kaptan.llm.replay import ReplayProvider, default_cassette
from kaptan.llm.store import MemoryStore, RedisStore
from kaptan.llm.usage import sync_usage
from kaptan.settings import Settings
from tests.conftest import reseed_test_db
from tests.unit.llm_support import GEMINI_URL, GROQ_URL, RecordedAgents, fake_settings

pytestmark = pytest.mark.integration

REC = next(r for r in default_cassette()._by_fp.values() if r.run_id == "run-demo-e3-ornek")


async def _redis(settings: Settings) -> Redis:
    client = Redis.from_url(settings.redis_url.get_secret_value())
    try:
        await client.ping()
    except (RedisError, OSError) as exc:
        await client.aclose()
        pytest.skip(f"compose Redis unreachable: {exc}")
    return client


async def test_redis_store_counts_and_caches(migrated: Settings) -> None:
    redis = await _redis(migrated)
    store = RedisStore(redis)
    key = f"kaptan:test:llm-store:{datetime.now(UTC).timestamp()}"  # outside the live key space
    try:
        assert await store.incr(key, "req", 2, ttl_s=60) == 2
        assert await store.incr(key, "req", -1, ttl_s=60) == 1
        assert await store.hgetall(key) == {"req": 1}
        assert 0 < await redis.ttl(key) <= 60
        await store.set(f"{key}:v", "değer", ttl_s=60)
        assert await store.get(f"{key}:v") == "değer"
        assert await store.get(f"{key}:missing") is None
    finally:
        await redis.delete(key, f"{key}:v")
        await redis.aclose()


async def _rows(conn: DictConn, sql: str) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql)
        return [dict(r) for r in await cur.fetchall()]


async def test_sync_usage_writes_rows_and_quota(pg: DictConn) -> None:
    assert await sync_usage(pg, ReplayProvider()) == 0
    live = build_live_provider(fake_settings(), store=MemoryStore(), http=httpx.AsyncClient())
    await live.budget.reserve("gemini")
    await live.budget.reserve("deepseek", est_cost_usd=0.001)
    live._pending.append(
        UsageEvent(datetime.now(UTC), "run-x", "reader", "gemini", "gemini-3.5-flash-lite", 10, 5, False, 7, 0.0)
    )
    async with pg.transaction(force_rollback=True):
        assert await sync_usage(pg, live) == 1
        rows = await _rows(pg, "SELECT run_id, agent, provider, tokens_in, cached FROM trading.llm_usage")
        assert rows[-1] == {
            "run_id": "run-x",
            "agent": "reader",
            "provider": "gemini",
            "tokens_in": 10,
            "cached": False,
        }
        quota = {r["provider"]: r for r in await _rows(pg, "SELECT provider, used, limit_n FROM trading.quota_usage")}
        assert quota["Gemini Flash-Lite"]["limit_n"] == 400 and quota["Gemini Flash-Lite"]["used"] >= 1
        assert quota["DeepSeek"]["used"] == 1 and quota["Prompt Guard 2"]["limit_n"] == 14_000


@respx.mock
async def test_inject_e3_on_the_live_chain(pg: DictConn, migrated: Settings) -> None:
    recorded = RecordedAgents(REC.outputs)
    respx.post(GEMINI_URL).mock(side_effect=recorded.gemini)
    respx.post(GROQ_URL).mock(side_effect=recorded.groq)
    # MemoryStore, not Redis: real quota counters and cached answers in Redis must never see test traffic.
    live = build_live_provider(fake_settings(), store=MemoryStore(), http=httpx.AsyncClient())
    try:
        await pg.commit()
        result = await run_scenario(pg, "e3_contract", Clock(demo=True, started_at=datetime.now(UTC)), provider=live)
        assert result.explain["approval"] is not None
        assert result.explain["run"]["outcome"] == "PROPOSE"
        rows = await _rows(
            pg, "SELECT agent, provider, cached FROM trading.llm_usage WHERE run_id = 'run-demo-e3-ornek'"
        )
        assert {r["agent"] for r in rows} == {
            "guard", "classifier", "reader", "materiality", "evidence", "skeptic", "compliance",
        }  # fmt: skip
        assert isinstance(live, LiveProvider) and live.drain_usage() == []
    finally:
        await pg.rollback()
        await reseed_test_db(migrated)
