"""The Param insight routes: the sign-in is needed, bad input is a plain 422, the empty answers keep their shape."""

from __future__ import annotations

import httpx
import pytest

from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

READS = (
    "/api/v1/me/insights/allocation",
    "/api/v1/me/insights/closed-trades",
    "/api/v1/me/insights/stats",
    "/api/v1/me/insights/dividends",
    "/api/v1/me/insights/versus",
    "/api/v1/me/notes",
)


async def test_every_route_needs_a_session(client: httpx.AsyncClient) -> None:
    for url in READS:
        assert (await client.get(url)).status_code == 401
    assert (await client.put("/api/v1/me/insights/concentration", json={"threshold_pct": 30})).status_code == 401
    assert (await client.put("/api/v1/me/notes/KRGCL", json={"body": "Deneme notu"})).status_code == 401
    assert (await client.delete("/api/v1/me/notes/KRGCL")).status_code == 401


async def test_reads_answer_and_bad_input_is_refused(client: httpx.AsyncClient) -> None:
    auth = bearer((await login(client))["access_token"])
    for url in READS:
        assert (await client.get(url, headers=auth)).status_code == 200, url
    for bad in (4, 101, 25.5):
        res = await client.put("/api/v1/me/insights/concentration", json={"threshold_pct": bad}, headers=auth)
        assert res.status_code == 422, bad
    short = await client.put("/api/v1/me/notes/KRGCL", json={"body": "ab"}, headers=auth)
    assert short.status_code == 422
    assert (await client.put("/api/v1/me/notes/krgcl!", json={"body": "abc def"}, headers=auth)).status_code == 422
