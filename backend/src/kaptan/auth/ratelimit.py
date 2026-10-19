"""Rate limiting (09 §6, NFR-09): login 5/min per client IP, mutating endpoints 60/min per user.

Two backends with the same `allow(key)` contract:
- `SlidingWindowLimiter`: in-process (dev/test, one API process; the M1 behaviour);
- `RedisRateLimiter`: a sliding window in a Redis sorted set (ZREMRANGEBYSCORE + ZADD + ZCARD in one
  MULTI), shared by every API process. A Redis outage falls back to an in-process window, so login stays
  limited instead of open.

`client_ip()` believes `X-Forwarded-For` only from TRUSTED_PROXIES: it walks the header right to left
and returns the first hop that is not a trusted proxy.
"""

from __future__ import annotations

import ipaddress
import logging
import secrets
import time
from collections import deque
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import Any, Final, Protocol

from redis.exceptions import RedisError

log = logging.getLogger("kaptan.auth.ratelimit")

KEY_PREFIX: Final = "kaptan:rl:"
IpNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


class Limiter(Protocol):
    async def hit(self, key: str) -> bool: ...


@dataclass
class SlidingWindowLimiter:
    limit: int
    window_s: float = 60.0
    clock: Callable[[], float] = field(default=time.monotonic)
    _hits: dict[str, deque[float]] = field(default_factory=dict)

    def allow(self, key: str) -> bool:
        """Record a hit for `key`; False when the window is already full."""
        now = self.clock()
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] >= self.window_s:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        return True

    async def hit(self, key: str) -> bool:
        return self.allow(key)

    def reset(self) -> None:
        self._hits.clear()


@dataclass
class RedisRateLimiter:
    """Sliding window per key in `kaptan:rl:<key>` (a sorted set of hit timestamps)."""

    redis: Any
    limit: int
    window_s: float = 60.0
    clock: Callable[[], float] = field(default=time.time)
    fallback: SlidingWindowLimiter | None = None

    def __post_init__(self) -> None:
        if self.fallback is None:
            self.fallback = SlidingWindowLimiter(limit=self.limit, window_s=self.window_s)

    async def hit(self, key: str) -> bool:
        now = self.clock()
        rkey = f"{KEY_PREFIX}{key}"
        member = f"{now:.6f}:{secrets.token_hex(4)}"
        try:
            async with self.redis.pipeline(transaction=True) as pipe:
                pipe.zremrangebyscore(rkey, 0, now - self.window_s)
                pipe.zcard(rkey)
                pipe.zadd(rkey, {member: now})
                pipe.expire(rkey, int(self.window_s) + 1)
                _removed, count, _added, _ttl = await pipe.execute()
        except (RedisError, OSError) as exc:
            log.warning("rate limiter: redis unavailable (%s); in-process window for now", type(exc).__name__)
            assert self.fallback is not None
            return self.fallback.allow(key)
        if int(count) >= self.limit:
            await self._undo(rkey, member)
            return False
        return True

    async def _undo(self, rkey: str, member: str) -> None:
        # A refused hit does not count (same as the in-process window), so a client that waits gets in.
        try:
            await self.redis.zrem(rkey, member)
        except (RedisError, OSError):
            return


def parse_networks(values: Iterable[str]) -> tuple[IpNetwork, ...]:
    out: list[IpNetwork] = []
    for raw in values:
        try:
            out.append(ipaddress.ip_network(raw.strip(), strict=False))
        except ValueError:
            log.warning("TRUSTED_PROXIES: %r is not an IP or CIDR; ignored", raw)
    return tuple(out)


def _is_trusted(host: str, networks: tuple[IpNetwork, ...]) -> bool:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return any(ip in net for net in networks)


def client_ip(peer: str | None, forwarded_for: str | None, trusted: tuple[IpNetwork, ...]) -> str:
    """The caller's IP: the peer, unless the peer is a trusted proxy and X-Forwarded-For names someone else."""
    host = peer or "unknown"
    if not forwarded_for or not trusted or not _is_trusted(host, trusted):
        return host
    hops = [h.strip() for h in forwarded_for.split(",") if h.strip()]
    for hop in reversed(hops):
        if not _is_trusted(hop, trusted):
            return hop[:64]
    return hops[0][:64] if hops else host
