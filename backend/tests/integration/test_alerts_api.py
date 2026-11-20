"""GET /api/v1/me/alerts and POST /me/alerts/test: what is switched on, never the topic or the address."""

from __future__ import annotations

import httpx
import pytest
import redis.asyncio as aioredis
import respx
from asgi_lifespan import LifespanManager
from pydantic import SecretStr

from kaptan.alerts.service import RATE_PREFIX, STATE_KEY
from kaptan.api.deps import settings_dep
from kaptan.settings import Settings
from tests.conftest import DEMO_PASSPHRASE, SeedResult, bearer
from tests.harness.app import create_test_app

pytestmark = pytest.mark.integration

URL = "/api/v1/me/alerts"
TEST_URL = "/api/v1/me/alerts/test"


async def _headers(client: httpx.AsyncClient) -> dict[str, str]:
    res = await client.post("/api/v1/auth/login", json={"passphrase": DEMO_PASSPHRASE})
    assert res.status_code == 200, res.text
    return bearer(res.json()["access_token"])


async def _clean(settings: Settings) -> None:
    redis = aioredis.from_url(settings.redis_url.get_secret_value(), decode_responses=True)
    try:
        await redis.delete(STATE_KEY, f"{RATE_PREFIX}test")
    finally:
        await redis.aclose()


async def test_it_needs_a_session(client: httpx.AsyncClient) -> None:
    assert (await client.get(URL)).status_code == 401
    assert (await client.post(TEST_URL)).status_code == 401


async def test_nothing_configured_says_both_off(client: httpx.AsyncClient, migrated: Settings) -> None:
    await _clean(migrated)
    headers = await _headers(client)
    assert (await client.get(URL, headers=headers)).json() == {
        "ntfy": False,
        "email": False,
        "last_sent_at": None,
        "last_error_tr": None,
    }
    res = await client.post(TEST_URL, headers=headers)  # nothing to send through: no error, same document
    assert res.status_code == 200 and res.json()["ntfy"] is False
    await _clean(migrated)


async def test_test_message_goes_out_once_a_minute(seeded: SeedResult, migrated: Settings) -> None:
    await _clean(migrated)
    topic = "kaptan-test-only-topic-0123456789"
    configured = migrated.model_copy(update={"alert_ntfy_topic": SecretStr(topic)})
    app = create_test_app(configured)
    app.dependency_overrides[settings_dep] = lambda: configured
    with respx.mock(assert_all_called=True) as mock:
        route = mock.post("https://ntfy.sh/").mock(return_value=httpx.Response(200, json={}))
        async with LifespanManager(app) as manager:
            transport = httpx.ASGITransport(app=manager.app)
            async with httpx.AsyncClient(transport=transport, base_url="https://testserver") as http:
                headers = await _headers(http)
                first = await http.post(TEST_URL, headers=headers)
                assert first.status_code == 200
                doc = first.json()
                assert doc["ntfy"] is True and doc["email"] is False
                assert doc["last_sent_at"] and doc["last_error_tr"] is None
                assert topic not in first.text and topic not in (await http.get(URL, headers=headers)).text
                assert route.call_count == 1
                again = await http.post(TEST_URL, headers=headers)
                assert again.status_code == 429 and again.json()["code"] == "rate_limited"
                assert route.call_count == 1
    await _clean(migrated)
