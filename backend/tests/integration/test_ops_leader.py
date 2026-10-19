"""Single-replica guard (Postgres advisory lock) and the worker shell: heartbeat, SIGTERM drain."""

from __future__ import annotations

import asyncio
import contextlib
import json
import signal
import sys

import pytest
import redis.asyncio as aioredis

from kaptan.ops import runtime
from kaptan.ops.heartbeat import hb_key
from kaptan.ops.leader import LeaderLock
from kaptan.settings import Settings

pytestmark = pytest.mark.integration


async def test_a_second_instance_waits_for_the_leader(migrated: Settings) -> None:
    url = migrated.database_url.get_secret_value()
    stop = asyncio.Event()
    async with LeaderLock(url, "test_ops_leader", retry_s=0.05) as first:
        assert await first.acquire(stop)
        async with LeaderLock(url, "test_ops_leader", retry_s=0.05) as second:
            assert not await second.try_acquire()
            waiter = asyncio.create_task(second.acquire(stop))
            await asyncio.sleep(0.2)
            assert not waiter.done()  # still waiting
            await first.release()
            assert await asyncio.wait_for(waiter, timeout=5)
            assert second.held
    stop.set()


async def test_acquire_gives_up_when_stopped(migrated: Settings) -> None:
    url = migrated.database_url.get_secret_value()
    async with LeaderLock(url, "test_ops_leader_stop", retry_s=0.05) as holder:
        assert await holder.try_acquire()
        async with LeaderLock(url, "test_ops_leader_stop", retry_s=0.05) as other:
            stop = asyncio.Event()
            task = asyncio.create_task(other.acquire(stop))
            await asyncio.sleep(0.1)
            stop.set()
            assert await asyncio.wait_for(task, timeout=5) is False


async def test_a_lost_lock_connection_stops_the_worker(migrated: Settings) -> None:
    url = migrated.database_url.get_secret_value()
    stop = asyncio.Event()
    async with LeaderLock(url, "test_ops_leader_lost", watch_s=0.05) as lock:
        assert await lock.acquire(stop)
        assert lock.conn is not None
        await lock.conn.close()  # the network went away
        await asyncio.wait_for(lock.lost.wait(), timeout=5)
        assert stop.is_set()
        assert not lock.held


async def test_supervise_beats_drains_and_clears(migrated: Settings) -> None:
    redis = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    seen: dict[str, str] = {}
    finished: list[str] = []

    async def work(settings: Settings, stop: asyncio.Event) -> int:
        raw = await redis.get(hb_key("scheduler"))
        seen["beat"] = json.loads(raw or "{}").get("state", "")
        await stop.wait()
        await asyncio.sleep(0.05)  # finishing the unit in flight
        finished.append("acked")
        return 7

    stop = asyncio.Event()
    try:
        task = asyncio.create_task(runtime.supervise(migrated, "scheduler", work, stop=stop, leader=True))
        for _ in range(100):
            if "beat" in seen:
                break
            await asyncio.sleep(0.02)
        stop.set()
        assert await asyncio.wait_for(task, timeout=10) == 7
        assert seen["beat"] == "running"
        assert finished == ["acked"]
        assert await redis.get(hb_key("scheduler")) is None  # a clean exit clears the beat
    finally:
        await redis.delete(hb_key("scheduler"))
        await redis.aclose()


async def test_a_drain_that_hangs_is_cancelled(migrated: Settings) -> None:
    cancelled: list[bool] = []

    async def work(settings: Settings, stop: asyncio.Event) -> int:
        try:
            await asyncio.sleep(60)
        except asyncio.CancelledError:
            cancelled.append(True)
            raise
        return 1

    stop = asyncio.Event()
    task = asyncio.create_task(
        runtime.supervise(migrated, "scheduler", work, stop=stop, leader=False, drain_timeout_s=0.1)
    )
    await asyncio.sleep(0.1)
    stop.set()
    assert await asyncio.wait_for(task, timeout=10) == 0
    assert cancelled == [True]


async def test_stop_signals_set_the_event() -> None:
    stop = asyncio.Event()
    installed = runtime.install_stop_signals(stop)
    try:
        assert signal.SIGTERM in installed
        handler = signal.getsignal(signal.SIGTERM)
        if sys.platform == "win32" and callable(handler):  # the signal.signal fallback: call it as the OS would
            handler(signal.SIGTERM, None)
        else:  # POSIX: the loop's handler
            signal.raise_signal(signal.SIGTERM)
        await asyncio.wait_for(stop.wait(), timeout=2)
    finally:
        loop = asyncio.get_running_loop()
        for sig in installed:
            with contextlib.suppress(NotImplementedError, RuntimeError):
                loop.remove_signal_handler(sig)
            signal.signal(sig, signal.SIG_DFL if sig == signal.SIGTERM else signal.default_int_handler)
