"""SSE for newly ingested KAP rows: `disclosure` (DisclosureListItem) per row, then one `counters`.

Called after the ingest transaction committed, outside DEMO_MODE only, with the worker's own Redis
client (`kaptan.events.publish` accepts a client). The panel's feed stream is the same one the demo
ticker uses, so the panel needs nothing new.

`publish_to_agents()` feeds the agent worker (kaptan.agents.feed): one entry per disclosure and stage on
the Redis stream `kaptan:kap.disclosures` (`listed` when the list row is stored, `text` when its full
text is). A `SET NX` marker per (index, stage) makes the producer idempotent across polls/reconciles;
the consumer is idempotent on the index too (ops.agent_feed), so a duplicate entry is harmless.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Final

from pydantic import ValidationError
from redis.exceptions import RedisError

from kaptan.demo.ticker import LIST_ITEM_COLUMNS, list_item
from kaptan.disclosures.counters import day_counters
from kaptan.events.publish import publish

log = logging.getLogger("kaptan.ingest.publish")

#: Redis stream the agent worker consumes (consumer group `agent-worker`).
AGENT_STREAM: Final = "kaptan:kap.disclosures"
AGENT_STREAM_MAXLEN: Final = 20_000
#: How long the producer remembers that it sent (index, stage).
AGENT_SENT_TTL_S: Final = 14 * 24 * 3600
STAGES: Final = frozenset({"listed", "text"})


def sent_key(index: int, stage: str) -> str:
    return f"{AGENT_STREAM}:sent:{index}:{stage}"


async def publish_to_agents(redis: Any, indices: list[int], stage: str = "listed") -> int:
    """Append each disclosure once per stage to the agent stream; returns how many were appended.

    A Redis failure is logged and skipped (ingestion must not stop); the marker is removed again so the
    next poll can retry."""
    if stage not in STAGES:
        raise ValueError(f"unknown feed stage {stage!r}")
    sent = 0
    for index in indices:
        key = sent_key(index, stage)
        try:
            if not await redis.set(key, "1", nx=True, ex=AGENT_SENT_TTL_S):
                continue
            fields = {"disclosure_index": str(index), "stage": stage}
            await redis.xadd(AGENT_STREAM, fields, maxlen=AGENT_STREAM_MAXLEN, approximate=True)
        except (RedisError, OSError):
            log.exception("agent feed publish failed: disclosure=%s stage=%s", index, stage)
            try:
                await redis.delete(key)
            except (RedisError, OSError):
                log.warning("agent feed: could not clear the marker of %s/%s", index, stage)
            continue
        sent += 1
    return sent


NEW_ROWS_SQL: Final = f"""
SELECT {LIST_ITEM_COLUMNS} FROM core.disclosures
 WHERE disclosure_index = ANY(%s) AND origin = 'kap' AND visible
 ORDER BY disclosure_index
"""  # noqa: S608 - constant column list, the indices are bound


async def publish_new(conn: Any, redis: Any, indices: list[int], now: datetime) -> int:
    """Publish the visible rows among `indices` and the new counters. Returns the rows published."""
    async with conn.cursor() as cur:
        await cur.execute(NEW_ROWS_SQL, (indices,))
        rows = await cur.fetchall()
    published = 0
    for row in rows:
        try:
            item = list_item(dict(row))
        except ValidationError:
            log.exception("disclosure %s does not fit the panel schema; not published", row["disclosure_index"])
            continue
        if await publish(redis, "feed", "disclosure", item) is not None:
            published += 1
    if rows:
        await publish(redis, "feed", "counters", await day_counters(conn, now))
        await publish_to_agents(redis, [int(r["disclosure_index"]) for r in rows])
    return published
