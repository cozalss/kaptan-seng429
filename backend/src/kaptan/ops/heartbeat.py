"""Worker heartbeats in Redis: `kaptan:hb:<component>` = {"at", "pid", "host"} with a TTL.

Each worker beats every HEARTBEAT_EVERY_S; the key expires after HEARTBEAT_TTL_S, so a dead worker
disappears by itself. `/readyz` and `/metrics` report them (informational: a stopped worker does not
make the API unready), the container healthcheck of a worker checks its own key.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
from datetime import UTC, datetime
from typing import Any, Final

from redis.exceptions import RedisError

log = logging.getLogger("kaptan.ops.heartbeat")

HB_PREFIX: Final = "kaptan:hb:"
HEARTBEAT_EVERY_S: Final = 15.0
HEARTBEAT_TTL_S: Final = 60
#: Components that beat (the API answers /healthz instead).
WORKERS: Final = ("ingest_worker", "agent_worker", "scheduler")


def hb_key(component: str) -> str:
    return f"{HB_PREFIX}{component}"


async def beat(redis: Any, component: str, *, state: str = "running", now: datetime | None = None) -> None:
    at = (now or datetime.now(UTC)).isoformat(timespec="seconds")
    value = json.dumps({"at": at, "pid": os.getpid(), "host": socket.gethostname(), "state": state})
    await redis.set(hb_key(component), value, ex=HEARTBEAT_TTL_S)


async def beat_forever(redis: Any, component: str, stop: asyncio.Event, state: dict[str, str]) -> None:
    """Beat until `stop`; `state["state"]` (waiting_leader / running / draining) goes with every beat."""
    while not stop.is_set():
        try:
            await beat(redis, component, state=state.get("state", "running"))
        except (RedisError, OSError) as exc:
            log.warning("heartbeat failed: %s", type(exc).__name__)
        try:
            await asyncio.wait_for(stop.wait(), timeout=HEARTBEAT_EVERY_S)
        except TimeoutError:
            continue


async def clear(redis: Any, component: str) -> None:
    """A clean exit removes the beat at once (a crash lets it expire)."""
    try:
        await redis.delete(hb_key(component))
    except (RedisError, OSError) as exc:
        log.warning("heartbeat not cleared: %s", type(exc).__name__)


async def read_heartbeats(redis: Any, now: datetime | None = None) -> dict[str, dict[str, Any]]:
    """{component: {"status": "ok"|"missing", "age_s", "state", "host"}} for every known worker."""
    now = now or datetime.now(UTC)
    out: dict[str, dict[str, Any]] = {}
    for component in WORKERS:
        raw = await redis.get(hb_key(component))
        if raw is None:
            out[component] = {"status": "missing"}
            continue
        try:
            doc = json.loads(raw)
            age = (now - datetime.fromisoformat(doc["at"])).total_seconds()
        except (ValueError, KeyError, TypeError):
            out[component] = {"status": "invalid"}
            continue
        out[component] = {"status": "ok", "age_s": round(age, 1), "state": doc.get("state"), "host": doc.get("host")}
    return out
