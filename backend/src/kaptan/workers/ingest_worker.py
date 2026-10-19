"""worker-ingest (04 §3): the live KAP poller + the detail-text fetcher, one process, one KAP client.

    KAP_LIVE=true uv run python -m kaptan.workers.ingest_worker

Runs only with KAP_LIVE=true (exits 0 otherwise, so DEMO_MODE setups are never touched by accident).
Both loops share one KapClient, so every KAP request of the process is serialised and at least
KAP_MIN_INTERVAL_S apart. Single writer: run one replica. Outside DEMO_MODE new rows are published as
SSE `disclosure` + `counters` on the feed stream (the API serves the stream from Redis); in DEMO_MODE
they are stored invisible and nothing is published.
"""

from __future__ import annotations

import asyncio
import logging
import random
import sys
from collections.abc import Awaitable, Callable
from typing import Any, Final

import redis.asyncio as aioredis
from psycopg import Error as PgError

from kaptan.db import create_pool
from kaptan.ingest import repo
from kaptan.ingest.detail_fetcher import fetch_one
from kaptan.ingest.kap_client import KapBlockedError, KapClient, KapError
from kaptan.ingest.kap_poller import EMPTY_BACKOFF_S, KapPoller, PollConfig, next_delay
from kaptan.ingest.publish import publish_to_agents
from kaptan.ops.metrics import incr_waf
from kaptan.ops.runtime import run_worker_process
from kaptan.rag.index import index_new_disclosures
from kaptan.settings import Settings

log = logging.getLogger("kaptan.workers.ingest")

ALERT_AFTER_FAILURES: Final = 3
IDLE_QUEUE_S: Final = 10.0
DETAIL_ERROR_S: Final = 30.0

Sleep = Callable[[asyncio.Event, float], Awaitable[None]]


async def wait_or_stop(stop: asyncio.Event, seconds: float) -> None:
    """Sleep `seconds` unless `stop` is set first."""
    try:
        await asyncio.wait_for(stop.wait(), timeout=max(0.0, seconds))
    except TimeoutError:
        return


async def poll_loop(
    poller: KapPoller, stop: asyncio.Event, *, sleep: Sleep = wait_or_stop, rand: Callable[[], float] = random.random
) -> None:
    failures = 0
    while not stop.is_set():
        try:
            result = await poller.poll_once()
        except KapBlockedError as exc:
            failures += 1
            log.warning("kap poll: WAF/back-off signal (%s); failures=%d", exc, failures)
            redis = getattr(poller, "redis", None)
            if redis is not None:
                await incr_waf(redis, "poll")
        except (KapError, PgError, OSError) as exc:
            failures += 1
            log.warning("kap poll failed: %s: %s; failures=%d", type(exc).__name__, exc, failures)
        except Exception:  # a bug must not kill the worker; it is logged with its traceback
            failures += 1
            log.exception("kap poll crashed; failures=%d", failures)
        else:
            failures = 0
            if result.inserted or result.errors:
                log.info(
                    "kap poll: %d rows, %d new, %d published, %d row errors%s",
                    result.fetched,
                    result.inserted,
                    result.published,
                    len(result.errors),
                    " (reconciled)" if result.reconciled else "",
                )
        if failures >= ALERT_AFTER_FAILURES:
            log.error("kap_poll_failures=%d in a row", failures)
        await sleep(stop, next_delay(poller.now(), poller.cfg, failures, rand()))


async def detail_loop(
    pool: Any,
    client: KapClient,
    stop: asyncio.Event,
    *,
    sleep: Sleep = wait_or_stop,
    redis: Any = None,
    rag_index: bool = False,
) -> None:
    async def text_ready(idx: int) -> None:
        if rag_index:  # RAG_INDEX_ON_INGEST: index the text first, so the run the feed starts can be found later
            async with pool.connection() as conn:
                await index_new_disclosures(conn, [idx])
        if redis is not None:  # the agent feed's `text` stage (outside DEMO_MODE only)
            await publish_to_agents(redis, [idx], stage="text")

    on_stored = text_ready if redis is not None or rag_index else None
    while not stop.is_set():
        try:
            idx = await (fetch_one(pool, client) if on_stored is None else fetch_one(pool, client, on_stored=on_stored))
        except KapBlockedError as exc:
            log.warning("detail fetch: WAF/back-off signal (%s); pausing", exc)
            if redis is not None:
                await incr_waf(redis, "detail")
            await sleep(stop, EMPTY_BACKOFF_S[-1])
            continue
        except (KapError, PgError, OSError) as exc:
            log.warning("detail fetch failed: %s: %s", type(exc).__name__, exc)
            await sleep(stop, DETAIL_ERROR_S)
            continue
        except Exception:
            log.exception("detail fetch crashed")
            await sleep(stop, DETAIL_ERROR_S)
            continue
        if idx is None:
            await sleep(stop, IDLE_QUEUE_S)


async def run_worker(settings: Settings, stop: asyncio.Event | None = None) -> int:
    if not settings.kap_live:
        log.info("KAP_LIVE is not true: live KAP ingestion is off (demo mode stays as it is)")
        return 0
    stop = stop or asyncio.Event()
    pool = create_pool(settings.database_url.get_secret_value(), min_size=1, max_size=3)
    await pool.open(wait=True)
    redis = aioredis.from_url(settings.redis_url.get_secret_value(), decode_responses=True)
    try:
        async with pool.connection() as conn:
            released = await repo.release_running(conn)
            await conn.commit()
        if released:
            log.info("re-queued %d detail rows left running by a previous worker", released)
        async with KapClient.from_settings(settings) as client:
            poller = KapPoller(pool=pool, client=client, cfg=PollConfig.from_settings(settings), redis=redis)
            loops = [asyncio.create_task(poll_loop(poller, stop), name="kap-poll")]
            if settings.kap_fetch_details:
                feed = None if settings.demo_mode else redis
                loops.append(
                    asyncio.create_task(
                        detail_loop(pool, client, stop, redis=feed, rag_index=settings.rag_index_on_ingest),
                        name="kap-detail",
                    )
                )
            log.info(
                "KAP ingest worker started (demo_mode=%s, details=%s)", settings.demo_mode, settings.kap_fetch_details
            )
            try:
                await asyncio.gather(*loops)
            finally:
                stop.set()
                for task in loops:
                    task.cancel()
                await asyncio.gather(*loops, return_exceptions=True)
    finally:
        await redis.aclose()
        await pool.close()
    return 0


def main() -> int:
    """JSON logs in prod, SIGTERM drain, heartbeat, and a leader lock: a second instance waits (kaptan.ops)."""
    return run_worker_process("ingest_worker", run_worker)


if __name__ == "__main__":
    sys.exit(main())
