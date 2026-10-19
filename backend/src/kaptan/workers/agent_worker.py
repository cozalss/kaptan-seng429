"""worker-agents: KAP disclosures from the ingest worker → real agent runs (kaptan.agents.feed).

    KAP_LIVE=true LLM_MODE=live CHECKPOINTER=postgres uv run python -m kaptan.workers.agent_worker

A separate process from the API on purpose: the API stays exactly as in M1 (demo/replay), LLM spend
lives in one place with its own hourly cap, and a crash or restart here never touches a request.
Runs only with KAP_LIVE=true and outside DEMO_MODE (the demo reset truncates the disclosures the runs
point at); exits 0 otherwise. One replica.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import UTC, datetime
from typing import Any

import redis.asyncio as aioredis

from kaptan.agents.checkpoint import open_saver
from kaptan.agents.feed import AgentFeed, FeedConfig, llm_budget_left
from kaptan.agents.feed_run import LiveDeps, LiveResult, run_disclosure, settle_waiting
from kaptan.agents.tools import ReplayToolbox, Toolbox
from kaptan.db import create_pool
from kaptan.llm import get_provider
from kaptan.ops.logs import bind_log_context
from kaptan.ops.runtime import run_worker_process
from kaptan.settings import Settings

log = logging.getLogger("kaptan.workers.agents")


def toolbox_for(settings: Settings) -> Toolbox:
    """The base toolbox. With LLM_MODE=live each run wraps it in kaptan.evidence's LiveToolbox (real
    prices and event study, feed_run.build_live_context); replay answers are empty for a real disclosure."""
    return ReplayToolbox()


def feed_for(settings: Settings, pool: Any, redis: Any, deps: LiveDeps) -> AgentFeed:
    async def runner(conn: Any, index: int, now: datetime) -> LiveResult:
        with bind_log_context(run_id=f"run-live-{index}", disclosure_index=index):
            return await run_disclosure(conn, index, now, deps)

    async def budget_ok() -> bool:
        return await llm_budget_left(deps.provider)

    async def settle(now: datetime) -> int:
        return await settle_waiting(pool, deps, now)

    cfg = FeedConfig(max_runs_per_hour=settings.agent_max_runs_per_hour)
    return AgentFeed(pool, redis, runner, cfg, budget_ok=budget_ok, settle=settle, now=lambda: datetime.now(UTC))


async def run_worker(settings: Settings, stop: asyncio.Event | None = None) -> int:
    if not settings.kap_live:
        log.info("KAP_LIVE is not true: the agent feed is off")
        return 0
    if settings.demo_mode:
        log.warning("DEMO_MODE=true: the agent feed does not run on a demo database")
        return 0
    stop = stop or asyncio.Event()
    pool = create_pool(settings.database_url.get_secret_value(), min_size=1, max_size=3)
    await pool.open(wait=True)
    redis = aioredis.from_url(settings.redis_url.get_secret_value(), decode_responses=True)
    try:
        async with open_saver(settings):
            provider = get_provider(settings.llm_mode, settings=settings, redis=redis)
            deps = LiveDeps(provider=provider, tools=toolbox_for(settings), redis=redis)
            log.info(
                "agent worker started (llm_mode=%s, checkpointer=%s, max_runs_per_hour=%d)",
                settings.llm_mode,
                settings.checkpointer,
                settings.agent_max_runs_per_hour,
            )
            await feed_for(settings, pool, redis, deps).run(stop)
    finally:
        await redis.aclose()
        await pool.close()
    return 0


def main() -> int:
    """JSON logs in prod, SIGTERM drain (the run in flight finishes and is acked), heartbeat, leader lock."""
    return run_worker_process("agent_worker", run_worker)


if __name__ == "__main__":
    sys.exit(main())
