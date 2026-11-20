"""The alert loop on a real Redis: desk events become one fixed message each, the cursor survives a restart."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
import redis.asyncio as aioredis
import respx
from pydantic import SecretStr

from kaptan.alerts.config import AlertConfig, NtfyTarget
from kaptan.alerts.service import RATE_PREFIX, STATE_KEY
from kaptan.alerts.watch import CURSOR_KEY, DOWN_KEY, AlertWatch
from kaptan.events import bus
from kaptan.settings import Settings

pytestmark = pytest.mark.integration

TOPIC = "kaptan-test-only-topic-0123456789"
CFG = AlertConfig(ntfy=NtfyTarget(url="https://ntfy.sh/", topic=SecretStr(TOPIC)), smtp=None, invalid=())
KEYS = (CURSOR_KEY, DOWN_KEY, STATE_KEY, bus.stream_key("desk"))


async def _wipe(redis: Any) -> None:
    await redis.delete(*KEYS, *(f"{RATE_PREFIX}{k}" for k in ("suggestion", "day_halt", "stopped", "part_down")))


async def test_desk_events_become_fixed_messages_and_a_restart_does_not_repeat_them(migrated: Settings) -> None:
    redis = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    now = datetime.now(UTC)
    try:
        await _wipe(redis)
        watch = AlertWatch(CFG, None, redis, lambda: now, block_ms=10)
        await watch.read_events()  # first start: only what comes after
        pending = json.dumps({"status": "pending", "ticker": "THYAO", "side": "BUY", "qty": 100})
        await bus.append(redis, "desk", "approval.requested", pending)
        await bus.append(redis, "desk", "kill_switch", json.dumps({"kill_switch": "on", "kill_reason": "x"}))
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post("https://ntfy.sh/").mock(return_value=httpx.Response(200, json={}))
            assert await watch.read_events() == ("suggestion", "stopped")
            sent = [json.loads(c.request.content)["message"] for c in route.calls]
            assert sent == ["KAPtan: yeni bir önerin var.", "KAPtan durduruldu."]
            assert all("THYAO" not in m and "100" not in m for m in sent)
            restarted = AlertWatch(CFG, None, redis, lambda: now, block_ms=10)
            assert await restarted.read_events() == ()  # the cursor was kept: nothing is announced twice
            assert route.call_count == 2
        assert await redis.hget(STATE_KEY, "last_sent_at")
    finally:
        await _wipe(redis)
        await redis.aclose()


async def test_a_part_down_for_fifteen_minutes_sends_one_message(
    migrated: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    from datetime import timedelta

    from kaptan.alerts import watch as watch_module
    from kaptan.ops.system_status import Facts

    redis = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    clock = [datetime.now(UTC)]
    dead = {"status": "missing"}
    ingest_down = Facts({"ingest_worker": dead}, None, None, None, False, first_seen_at=None)

    async def facts(_pool: Any, _redis: Any, _now: datetime) -> Facts:
        return ingest_down

    monkeypatch.setattr(watch_module, "read_facts", facts)
    try:
        await _wipe(redis)
        watch = AlertWatch(CFG, None, redis, lambda: clock[0], block_ms=10)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post("https://ntfy.sh/").mock(return_value=httpx.Response(200, json={}))
            told = []
            for _ in range(18):
                told.append(await watch.check_parts())
                clock[0] += timedelta(minutes=1)
            assert told.count(True) == 1 and told.index(True) == 15
            assert [json.loads(c.request.content)["message"] for c in route.calls] == ["KAPtan: bir parça çalışmıyor."]
    finally:
        await _wipe(redis)
        await redis.aclose()
