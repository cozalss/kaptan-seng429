"""Rate limiter units: trusted-proxy client IP, the Redis window's fallback, backend selection."""

from __future__ import annotations

from typing import Any

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from kaptan.auth.ratelimit import RedisRateLimiter, SlidingWindowLimiter, client_ip, parse_networks
from kaptan.ops.http import make_limiter, mutation_limit, use_redis_limiter
from kaptan.settings import Settings

PROXIES = parse_networks(["10.0.0.0/8", "127.0.0.1"])


@pytest.mark.parametrize(
    ("peer", "xff", "expected"),
    [
        ("203.0.113.5", None, "203.0.113.5"),  # no header
        ("203.0.113.5", "1.2.3.4", "203.0.113.5"),  # peer is not a trusted proxy: header ignored
        ("10.1.2.3", "198.51.100.7", "198.51.100.7"),  # trusted proxy → the client it names
        ("10.1.2.3", "6.6.6.6, 198.51.100.7, 10.0.0.9", "198.51.100.7"),  # spoofed left part is skipped
        ("127.0.0.1", "10.0.0.2, 10.0.0.3", "10.0.0.2"),  # only proxies: the leftmost hop
        ("10.1.2.3", " , ", "10.1.2.3"),  # empty header
        (None, None, "unknown"),
        ("10.1.2.3", "not-an-ip", "not-an-ip"),
    ],
)
def test_client_ip_believes_only_trusted_proxies(peer: str | None, xff: str | None, expected: str) -> None:
    assert client_ip(peer, xff, PROXIES) == expected


def test_client_ip_without_trusted_proxies_is_the_peer() -> None:
    assert client_ip("10.1.2.3", "198.51.100.7", ()) == "10.1.2.3"
    assert client_ip("unix-socket", "198.51.100.7", PROXIES) == "unix-socket"


def test_parse_networks_skips_garbage() -> None:
    nets = parse_networks(["10.0.0.0/8", "nonsense", "::1"])
    assert len(nets) == 2


async def test_sliding_window_hit_is_async_allow() -> None:
    t = [0.0]
    lim = SlidingWindowLimiter(limit=1, window_s=10, clock=lambda: t[0])
    assert await lim.hit("a")
    assert not await lim.hit("a")
    t[0] = 11
    assert await lim.hit("a")


class BrokenRedis:
    def pipeline(self, transaction: bool = True) -> Any:
        raise RedisConnectionError("down")


async def test_redis_limiter_falls_back_in_process_when_redis_is_down() -> None:
    lim = RedisRateLimiter(redis=BrokenRedis(), limit=2)
    assert [await lim.hit("k") for _ in range(3)] == [True, True, False]


def _settings(**over: object) -> Settings:
    base: dict[str, object] = {
        "kaptan_env": "dev",
        "rate_limit_backend": "auto",
        "mutation_rate_per_minute": 60,
        "login_rate_per_minute": 5,
    }
    base.update(over)
    return Settings.model_construct(**base)  # type: ignore[arg-type]


def test_backend_selection_and_the_e2e_override() -> None:
    assert not use_redis_limiter(_settings())
    assert use_redis_limiter(_settings(kaptan_env="prod"))
    assert use_redis_limiter(_settings(rate_limit_backend="redis"))
    assert not use_redis_limiter(_settings(kaptan_env="prod", rate_limit_backend="memory"))
    assert mutation_limit(_settings()) == 60
    assert mutation_limit(_settings(login_rate_per_minute=600)) == 600  # npm run e2e:api
    assert isinstance(make_limiter(_settings(), object(), 3), SlidingWindowLimiter)
    assert isinstance(make_limiter(_settings(rate_limit_backend="redis"), object(), 3), RedisRateLimiter)
    assert isinstance(make_limiter(_settings(rate_limit_backend="redis"), None, 3), SlidingWindowLimiter)
