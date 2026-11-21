"""Tatil modu in the agent feed: nothing runs while it lasts, the queue proceeds after (agent COMFORT)."""

from __future__ import annotations

from datetime import timedelta

import pytest
import redis.asyncio as aioredis
from psycopg_pool import AsyncConnectionPool

from kaptan.agents.feed import AgentFeed, FeedConfig
from kaptan.db import DictConn
from kaptan.disclosures.counters import day_counters
from kaptan.ops import pause
from kaptan.settings import Settings
from tests.conftest import reseed_test_db
from tests.integration.test_feed import NOW, FakeRunner, add_disclosure, feed_db, redis  # noqa: F401

pytestmark = pytest.mark.integration


async def test_nothing_runs_while_paused_and_the_queue_proceeds_after(
    feed_db: AsyncConnectionPool[DictConn],  # noqa: F811
    redis: aioredis.Redis,  # noqa: F811
    migrated: Settings,
) -> None:
    async with feed_db.connection() as conn:
        await conn.execute("UPDATE ops.agent_feed SET started_at = %s", (NOW - timedelta(days=2),))
        await conn.commit()
    try:
        runner = FakeRunner()
        feed = AgentFeed(feed_db, redis, runner, FeedConfig(max_runs_per_hour=10), now=lambda: NOW)
        await feed.ensure_group()
        async with feed_db.connection() as conn:
            await pause.start_pause(conn, NOW, NOW + timedelta(days=2))
            await conn.commit()
        a, b = await add_disclosure(feed_db), await add_disclosure(feed_db)
        held = [await feed.handle(i) for i in (a, b)]
        assert [(h.status, h.reason, h.ack) for h in held] == [("deferred", "paused", True)] * 2
        assert runner.calls == []  # not one run, so no quota spent
        assert (await feed.sweep()).redriven == ()
        async with feed_db.connection() as conn:
            counters = await day_counters(conn, NOW)
        assert counters["deferred"] >= 2 and "Ara verdin" in str(counters["deferred_reason_tr"])

        async with feed_db.connection() as conn:
            await pause.end_pause(conn, NOW)
            await conn.commit()
        swept = await feed.sweep()
        assert set(swept.redriven) >= {a, b}  # kept, not lost
        await feed.read_new(block_ms=200)
        assert {a, b} <= set(runner.calls)
    finally:
        async with feed_db.connection() as conn:
            await pause.end_pause(conn, NOW)
            await conn.commit()
        await reseed_test_db(migrated)
