"""Record/replay of the price sources' HTTP traffic (no secrets: both endpoints are keyless).

`RecordingTransport` wraps the real transport and keeps every exchange; `CassetteTransport` serves
them back offline, matching on method + URL with sorted query parameters, and fails loudly on an
unrecorded request so a test can never reach the network.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx

HERE = Path(__file__).resolve().parent
CASSETTE = HERE / "cassette.json"
SESSIONS = HERE / "xu100_sessions_2018_2026.json"

#: The recorded windows (ticker, from, to); `record.py` fetches exactly these.
WINDOWS = (
    ("THYAO", date(2026, 7, 1), date(2026, 9, 30)),
    ("XU100", date(2026, 7, 1), date(2026, 9, 30)),
    ("FROTO", date(2025, 4, 1), date(2025, 6, 30)),
    ("XU100", date(2025, 4, 1), date(2025, 6, 30)),
    ("TRKCM", date(2020, 1, 2), date(2020, 3, 31)),
)


def key(method: str, url: str) -> str:
    parts = urlsplit(url)
    query = urlencode(sorted(parse_qsl(parts.query, keep_blank_values=True)))
    return f"{method.upper()} {urlunsplit((parts.scheme, parts.netloc, parts.path, query, ''))}"


class RecordingTransport(httpx.AsyncBaseTransport):
    def __init__(self) -> None:
        self._inner = httpx.AsyncHTTPTransport()
        self.entries: list[dict[str, Any]] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        response = await self._inner.handle_async_request(request)
        body = await response.aread()
        try:
            parsed: Any = json.loads(body)
        except ValueError:
            parsed = body.decode("utf-8", errors="replace")
        self.entries.append(
            {
                "key": key(request.method, str(request.url)),
                "status": response.status_code,
                "content_type": response.headers.get("content-type", ""),
                "body": parsed,
            }
        )
        # aread() already decoded gzip/br: hand back plain bytes without the encoding headers.
        headers = {k: v for k, v in response.headers.items() if k.lower() not in ("content-encoding", "content-length")}
        return httpx.Response(response.status_code, headers=headers, content=body, request=request)

    async def aclose(self) -> None:
        await self._inner.aclose()


class CassetteTransport(httpx.AsyncBaseTransport):
    def __init__(self, entries: list[dict[str, Any]] | None = None) -> None:
        data = entries if entries is not None else json.loads(CASSETTE.read_text(encoding="utf-8"))["entries"]
        self._by_key = {e["key"]: e for e in data}
        self.calls: list[str] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        k = key(request.method, str(request.url))
        self.calls.append(k)
        entry = self._by_key.get(k)
        if entry is None:
            raise AssertionError(f"unrecorded request: {k}")
        body = entry["body"]
        content = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        return httpx.Response(
            entry["status"], headers={"content-type": entry["content_type"]}, content=content, request=request
        )


def load_sessions() -> dict[str, list[str]]:
    data: dict[str, list[str]] = json.loads(SESSIONS.read_text(encoding="utf-8"))
    return data


@asynccontextmanager
async def replay_client(entries: list[dict[str, Any]] | None = None) -> AsyncIterator[Any]:
    """A `PoliteClient` over the cassette with no pacing (offline, instant)."""
    from kaptan.prices.http import PoliteClient, make_http_client

    async def no_sleep(_: float) -> None:
        return None

    async with make_http_client(transport=CassetteTransport(entries)) as http:
        yield PoliteClient(http, min_interval_s=0, jitter_s=0, sleep=no_sleep)
