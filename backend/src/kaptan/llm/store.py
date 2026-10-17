"""Where the live LLM layer keeps counters and cached answers: Redis in the app, memory in tests/scripts.

Keys are namespaced `kaptan:llm:*`. Redis survives API restarts, so a re-run of the same disclosure
after a restart is still free and today's quota counters are not reset by a deploy.
"""

from __future__ import annotations

import time
from typing import Any, Protocol

from redis.asyncio import Redis


class KVStore(Protocol):
    async def incr(self, key: str, field: str, amount: int, *, ttl_s: int) -> int: ...

    async def hgetall(self, key: str) -> dict[str, int]: ...

    async def get(self, key: str) -> str | None: ...

    async def set(self, key: str, value: str, *, ttl_s: int) -> None: ...


class MemoryStore:
    """Process-local store (single worker, tests). TTLs are honoured on read."""

    def __init__(self) -> None:
        self._hashes: dict[str, dict[str, int]] = {}
        self._values: dict[str, tuple[str, float]] = {}

    async def incr(self, key: str, field: str, amount: int, *, ttl_s: int) -> int:
        bucket = self._hashes.setdefault(key, {})
        bucket[field] = bucket.get(field, 0) + amount
        return bucket[field]

    async def hgetall(self, key: str) -> dict[str, int]:
        return dict(self._hashes.get(key, {}))

    async def get(self, key: str) -> str | None:
        hit = self._values.get(key)
        if hit is None or hit[1] < time.monotonic():
            return None
        return hit[0]

    async def set(self, key: str, value: str, *, ttl_s: int) -> None:
        self._values[key] = (value, time.monotonic() + ttl_s)


class RedisStore:
    """The same operations on Redis (HINCRBY + EXPIRE, GET/SET EX)."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def incr(self, key: str, field: str, amount: int, *, ttl_s: int) -> int:
        pipe = self._redis.pipeline(transaction=True)
        pipe.hincrby(key, field, amount)
        pipe.expire(key, ttl_s)
        result: list[Any] = await pipe.execute()
        return int(result[0])

    async def hgetall(self, key: str) -> dict[str, int]:
        raw: dict[Any, Any] = await self._redis.hgetall(key)
        return {_text(k): int(v) for k, v in raw.items()}

    async def get(self, key: str) -> str | None:
        value = await self._redis.get(key)
        return None if value is None else _text(value)

    async def set(self, key: str, value: str, *, ttl_s: int) -> None:
        await self._redis.set(key, value, ex=ttl_s)


def _text(value: Any) -> str:
    return value.decode("utf-8") if isinstance(value, bytes) else str(value)
