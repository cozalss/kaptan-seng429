"""Rate limiting through the API (NFR-09): login per client IP, mutations per user, shared through Redis."""

from __future__ import annotations

import pytest
import redis.asyncio as aioredis

from kaptan.auth.ratelimit import KEY_PREFIX
from kaptan.settings import Settings
from tests.conftest import DEMO_PASSPHRASE, bearer
from tests.integration.ops_support import app_client, unique_ip

pytestmark = pytest.mark.integration

LOGIN = "/api/v1/auth/login"


def limited(base: Settings, **over: object) -> Settings:
    return base.model_copy(update={"trusted_proxies": ["127.0.0.1/32"], **over})


async def test_login_limit_is_shared_by_every_api_process(migrated: Settings, seeded: object) -> None:
    s = limited(migrated, rate_limit_backend="redis", login_rate_per_minute=3)
    ip = unique_ip()
    redis = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    await redis.delete(f"{KEY_PREFIX}login:{ip}")
    xff = {"X-Forwarded-For": ip}
    try:
        async with app_client(s) as (a, _), app_client(s) as (b, _):
            first = [(await a.post(LOGIN, json={"passphrase": "x"}, headers=xff)).status_code for _ in range(2)]
            third = await b.post(LOGIN, json={"passphrase": "x"}, headers=xff)
            fourth = await b.post(LOGIN, json={"passphrase": DEMO_PASSPHRASE}, headers=xff)
            other_ip = await a.post(
                LOGIN, json={"passphrase": DEMO_PASSPHRASE}, headers={"X-Forwarded-For": unique_ip()}
            )
    finally:
        await redis.delete(f"{KEY_PREFIX}login:{ip}")
        await redis.aclose()
    assert first == [401, 401]
    assert third.status_code == 401
    assert fourth.status_code == 429
    assert fourth.json() == {"detail": "Çok fazla deneme. Bir dakika sonra yeniden deneyin.", "code": "rate_limited"}
    assert other_ip.status_code == 200


async def test_an_untrusted_peer_cannot_dodge_the_login_limit_with_x_forwarded_for(
    migrated: Settings, seeded: object
) -> None:
    s = migrated.model_copy(update={"trusted_proxies": [], "login_rate_per_minute": 2})
    async with app_client(s, client=("203.0.113.77", 1)) as (http, _):
        codes = [
            (await http.post(LOGIN, json={"passphrase": "x"}, headers={"X-Forwarded-For": unique_ip()})).status_code
            for _ in range(3)
        ]
    assert codes == [401, 401, 429]


async def test_mutations_are_limited_per_user(migrated: Settings, seeded: object) -> None:
    s = limited(migrated, mutation_rate_per_minute=2, login_rate_per_minute=1)
    async with app_client(s) as (http, _):
        admin = (
            await http.post(
                LOGIN, json={"passphrase": DEMO_PASSPHRASE, "role": "admin"}, headers={"X-Forwarded-For": unique_ip()}
            )
        ).json()
        analyst = (
            await http.post(
                LOGIN, json={"passphrase": DEMO_PASSPHRASE, "role": "analyst"}, headers={"X-Forwarded-For": unique_ip()}
            )
        ).json()
        h = bearer(admin["access_token"])
        codes = [
            (await http.post("/api/v1/auth/role", json={"role": "admin"}, headers=h)).status_code for _ in range(3)
        ]
        refused = await http.post("/api/v1/auth/role", json={"role": "admin"}, headers=h)
        reads = [(await http.get("/api/v1/me", headers=h)).status_code for _ in range(3)]
        other = await http.post("/api/v1/auth/role", json={"role": "analyst"}, headers=bearer(analyst["access_token"]))
    assert codes == [200, 200, 429]
    assert refused.status_code == 429
    assert refused.headers["retry-after"] == "60"
    assert refused.headers["x-content-type-options"] == "nosniff"
    assert refused.json() == {"detail": "Çok fazla istek. Biraz sonra yeniden deneyin.", "code": "rate_limited"}
    assert reads == [200, 200, 200]  # GET is never limited
    assert other.status_code == 200  # another person has their own window


async def test_anonymous_mutations_are_limited_per_ip(migrated: Settings, seeded: object) -> None:
    s = limited(migrated, mutation_rate_per_minute=2, login_rate_per_minute=1)
    ip = {"X-Forwarded-For": unique_ip()}
    async with app_client(s) as (http, _):
        codes = [(await http.post("/api/v1/auth/logout", headers=ip)).status_code for _ in range(3)]
        bad_token = await http.post("/api/v1/auth/logout", headers={**ip, "Authorization": "Bearer nope"})
    assert codes == [204, 204, 429]
    assert bad_token.status_code == 429  # an invalid token is counted against its IP
