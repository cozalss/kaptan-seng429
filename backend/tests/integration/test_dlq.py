"""`kaptan:kap.dlq`: a feed entry whose run fails 3 times is parked; the re-drive CLI puts it back."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

import pytest
import redis.asyncio as aioredis
from psycopg_pool import AsyncConnectionPool

from kaptan.agents.feed import DLQ_STREAM, MAX_ATTEMPTS, AgentFeed, FeedConfig, dead_letter
from kaptan.db import DictConn, connect
from kaptan.ingest.publish import AGENT_STREAM, publish_to_agents, sent_key
from kaptan.ops import dlq
from kaptan.settings import Settings
from tests.integration.test_feed import FakeRunner, add_disclosure, feed_db, feed_row
from tests.integration.test_feed import redis as feed_redis

pytestmark = pytest.mark.integration
__all__ = ["feed_db", "feed_redis"]

NOW_FIXED = datetime(2026, 10, 20, 9, 0)


@pytest.fixture
async def redis(feed_redis: aioredis.Redis) -> AsyncIterator[aioredis.Redis]:
    await feed_redis.delete(DLQ_STREAM)
    yield feed_redis
    await feed_redis.delete(DLQ_STREAM)


async def _fail_three_times(pool: AsyncConnectionPool[DictConn], redis: aioredis.Redis) -> int:
    runner = FakeRunner(crash=MAX_ATTEMPTS)
    feed = AgentFeed(pool, redis, runner, FeedConfig(block_ms=100))
    await feed.ensure_group()
    idx = await add_disclosure(pool)
    await redis.delete(sent_key(idx, "listed"))
    await publish_to_agents(redis, [idx])
    for _ in range(MAX_ATTEMPTS):
        await feed.read_new(block_ms=100)
        await feed.replay_pending()
    return idx


async def test_three_failures_park_the_entry_and_redrive_restarts_it(
    feed_db: AsyncConnectionPool[DictConn], redis: aioredis.Redis, migrated: Settings
) -> None:
    idx = await _fail_three_times(feed_db, redis)
    row = await feed_row(feed_db, idx)
    assert row is not None and row["status"] == "failed" and row["attempts"] == MAX_ATTEMPTS
    dead = await dlq.list_dead(redis)
    assert [d.index for d in dead] == [idx]
    assert dead[0].reason == "RuntimeError" and dead[0].attempts == MAX_ATTEMPTS

    conn = await connect(migrated.database_url.get_secret_value())
    try:
        assert [d.index for d in await dlq.redrive(conn, redis, {idx}, dry_run=True)] == [idx]
        assert len(await dlq.list_dead(redis)) == 1  # a dry run changes nothing
        assert await dlq.redrive(conn, redis, {123}) == []  # another index: nothing matched
        redriven = await dlq.redrive(conn, redis, None)
    finally:
        await conn.close()
    assert [d.index for d in redriven] == [idx]
    assert await dlq.list_dead(redis) == []
    row = await feed_row(feed_db, idx)
    assert row is not None and (row["status"], row["attempts"], row["reason"]) == ("awaiting_text", 0, "redrive")
    entries = await redis.xrange(AGENT_STREAM)
    assert entries[-1][1] == {"disclosure_index": str(idx), "stage": "redrive"}

    ok = FakeRunner()
    feed = AgentFeed(feed_db, redis, ok, FeedConfig(block_ms=100))
    handled = await feed.read_new(block_ms=200)
    assert [(h.index, h.status) for h in handled] == [(idx, "done")]
    assert ok.calls == [idx]


async def test_dead_letter_never_raises_on_a_redis_error() -> None:
    from redis.exceptions import ConnectionError as RedisConnectionError

    class Down:
        async def xadd(self, *_: Any, **__: Any) -> None:
            raise RedisConnectionError("down")

    await dead_letter(Down(), 1, None, "RuntimeError", 3, NOW_FIXED)


async def test_the_cli_lists_and_redrives(
    redis: aioredis.Redis, migrated: Settings, capsys: pytest.CaptureFixture[str]
) -> None:
    await redis.xadd(DLQ_STREAM, {"disclosure_index": "not-a-number"})
    assert await dlq.main_async(migrated, dlq.parse_args(["list"])) == 0
    assert "0 dead letter(s)" in capsys.readouterr().out
    assert await dlq.main_async(migrated, dlq.parse_args(["redrive", "--all", "--dry-run"])) == 1
    assert "0 would re-drive" in capsys.readouterr().out
