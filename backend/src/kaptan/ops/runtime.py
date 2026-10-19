"""The shared shell of every worker process: logging, prod checks, SIGTERM drain, heartbeat, leader lock.

    def main() -> int:
        return run_worker_process("ingest_worker", run_worker)     # run_worker(settings, stop) -> int

SIGTERM / SIGINT set the `stop` event. Workers check it between units of work (a poll, a feed entry),
so the unit in flight finishes and is acknowledged before the process exits ("drain and ack"). If the
work has not returned DRAIN_TIMEOUT_S after the signal, it is cancelled (un-acked feed entries are
redelivered on the next start). Keep the container's stop grace period above DRAIN_TIMEOUT_S.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import signal
from collections.abc import Callable, Coroutine
from typing import Any, Final

import redis.asyncio as aioredis
from redis.exceptions import RedisError

from kaptan.api.loop import run
from kaptan.ops.heartbeat import beat, beat_forever, clear
from kaptan.ops.leader import LeaderLock
from kaptan.ops.logs import setup_logging
from kaptan.settings import Component, ConfigError, Settings, ensure_production_ready, get_settings

log = logging.getLogger("kaptan.ops.runtime")

DRAIN_TIMEOUT_S: Final = 45.0
WorkerFn = Callable[[Settings, asyncio.Event], Coroutine[Any, Any, int]]


def install_stop_signals(stop: asyncio.Event) -> list[signal.Signals]:
    """SIGTERM/SIGINT → stop.set(). Uses the loop's handlers where supported (POSIX), else signal.signal."""
    loop = asyncio.get_running_loop()
    installed: list[signal.Signals] = []
    for sig in (signal.SIGTERM, signal.SIGINT):

        def _handler(*_: object, _sig: signal.Signals = sig) -> None:
            if not stop.is_set():
                log.info("%s received: draining", _sig.name)
            loop.call_soon_threadsafe(stop.set)

        try:
            loop.add_signal_handler(sig, _handler)
        except (NotImplementedError, RuntimeError, ValueError):  # Windows / not the main thread
            try:
                signal.signal(sig, _handler)
            except ValueError:
                continue
        installed.append(sig)
    return installed


async def supervise(
    settings: Settings,
    component: str,
    work: WorkerFn,
    *,
    stop: asyncio.Event | None = None,
    leader: bool = True,
    drain_timeout_s: float = DRAIN_TIMEOUT_S,
) -> int:
    """Heartbeat + (optional) leader lock around `work(settings, stop)`."""
    stop = stop or asyncio.Event()
    state = {"state": "waiting_leader" if leader else "running"}
    redis = aioredis.from_url(settings.redis_url.get_secret_value(), decode_responses=True)
    beats = asyncio.create_task(beat_forever(redis, component, stop, state), name=f"heartbeat-{component}")
    try:
        async with contextlib.AsyncExitStack() as stack:
            if leader:
                lock = await stack.enter_async_context(LeaderLock(settings.database_url.get_secret_value(), component))
                if not await lock.acquire(stop):
                    return 0
            state["state"] = "running"
            await _beat_now(redis, component)
            return await _run_with_drain(settings, work, stop, state, drain_timeout_s)
    finally:
        stop.set()
        await asyncio.gather(beats, return_exceptions=True)
        await clear(redis, component)
        await redis.aclose()


async def _beat_now(redis: Any, component: str) -> None:
    try:
        await beat(redis, component, state="running")
    except (RedisError, OSError) as exc:
        log.warning("heartbeat failed: %s", type(exc).__name__)


async def _run_with_drain(
    settings: Settings, work: WorkerFn, stop: asyncio.Event, state: dict[str, str], drain_timeout_s: float
) -> int:
    task: asyncio.Task[int] = asyncio.create_task(work(settings, stop), name="worker")
    stopper = asyncio.create_task(stop.wait(), name="stop-wait")
    done, _ = await asyncio.wait({task, stopper}, return_when=asyncio.FIRST_COMPLETED)
    if task not in done:
        state["state"] = "draining"
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=drain_timeout_s)
        except TimeoutError:
            log.warning("drain did not finish in %.0f s; cancelling (un-acked work is redelivered)", drain_timeout_s)
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            return 0
    stopper.cancel()
    await asyncio.gather(stopper, return_exceptions=True)
    return task.result()


def run_worker_process(component: Component, work: WorkerFn, *, leader: bool = True) -> int:
    """Process entry point: settings → logging → prod checks → signals → supervise()."""
    try:
        settings = get_settings()
    except ConfigError as exc:
        logging.basicConfig()
        logging.getLogger("kaptan").error("%s", exc)
        return 2
    setup_logging(settings, component)
    try:
        ensure_production_ready(settings, component)
    except ConfigError as exc:
        log.error("%s", exc)
        return 2

    async def main() -> int:
        stop = asyncio.Event()
        install_stop_signals(stop)
        return await supervise(settings, component, work, stop=stop, leader=leader)

    try:
        return run(main())
    except KeyboardInterrupt:
        return 0
