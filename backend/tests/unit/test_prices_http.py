"""PoliteClient: pacing, retries/backoff, Retry-After, 404 → None, hard errors."""

from __future__ import annotations

import httpx
import pytest
import respx

from kaptan.prices.http import PoliteClient, SourceError, make_http_client

URL = "https://example.test/data"


class Sleeps:
    def __init__(self) -> None:
        self.calls: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.calls.append(seconds)


def _client(http: httpx.AsyncClient, sleeps: Sleeps, **kw: float) -> PoliteClient:
    return PoliteClient(http, sleep=sleeps, jitter_s=0, **kw)  # type: ignore[arg-type]


@respx.mock
async def test_retries_on_429_then_succeeds_and_honours_retry_after() -> None:
    route = respx.get(URL).mock(
        side_effect=[
            httpx.Response(429, headers={"Retry-After": "7"}),
            httpx.Response(503),
            httpx.Response(200, json={"ok": True}),
        ]
    )
    sleeps = Sleeps()
    async with make_http_client() as http:
        client = _client(http, sleeps, min_interval_s=0, backoff_s=1)
        assert await client.get_json(URL, params={"a": "1"}) == {"ok": True}
    assert route.call_count == 3
    assert 7.0 in sleeps.calls  # Retry-After
    assert 2.0 in sleeps.calls  # backoff 1 * 2**1 on the second retry
    assert client.requests == 3


@respx.mock
async def test_gives_up_after_retries_on_transport_errors() -> None:
    respx.get(URL).mock(side_effect=httpx.ConnectTimeout("slow"))
    sleeps = Sleeps()
    async with make_http_client() as http:
        client = _client(http, sleeps, min_interval_s=0, retries=2, backoff_s=0.1)
        with pytest.raises(SourceError, match="giving up after 3 attempts"):
            await client.get_json(URL)


@respx.mock
async def test_404_is_none_and_other_errors_raise() -> None:
    respx.get(URL + "/missing").mock(return_value=httpx.Response(404))
    respx.get(URL + "/bad").mock(return_value=httpx.Response(400))
    respx.get(URL + "/html").mock(return_value=httpx.Response(200, text="<html>"))
    async with make_http_client() as http:
        client = _client(http, Sleeps(), min_interval_s=0)
        assert await client.get_json(URL + "/missing") is None
        with pytest.raises(SourceError, match="HTTP 400"):
            await client.get_json(URL + "/bad")
        with pytest.raises(SourceError, match="not JSON"):
            await client.get_json(URL + "/html")


@respx.mock
async def test_requests_are_paced() -> None:
    respx.get(URL).mock(return_value=httpx.Response(200, json=[]))
    sleeps = Sleeps()
    async with make_http_client() as http:
        client = _client(http, sleeps, min_interval_s=5)
        await client.get_json(URL)
        await client.get_json(URL)
    assert len(sleeps.calls) == 1 and 4.0 < sleeps.calls[0] <= 5.0
