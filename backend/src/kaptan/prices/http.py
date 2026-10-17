"""A polite async HTTP client for the price sources: one request at a time per host, a minimum
interval with jitter, bounded retries with exponential backoff on 429/5xx/timeouts, `Retry-After`
honoured, a real browser User-Agent, and a long timeout (İş Yatırım needs ≥ 90 s, 07 §6).
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, Final

import httpx

log = logging.getLogger(__name__)

USER_AGENT: Final = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
DEFAULT_TIMEOUT_S: Final = 90.0
RETRY_STATUSES: Final = frozenset({429, 500, 502, 503, 504, 666})  # 666 = MKK/WAF-style back-off signal
MAX_RETRY_AFTER_S: Final = 120.0

Sleep = Callable[[float], Awaitable[None]]


class SourceError(RuntimeError):
    """A price source failed after its retries (or answered something unusable)."""


class PoliteClient:
    """Wraps an `httpx.AsyncClient`; `get_json()` is the only entry point the sources use."""

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        min_interval_s: float = 2.0,
        jitter_s: float = 0.5,
        retries: int = 3,
        backoff_s: float = 2.0,
        sleep: Sleep = asyncio.sleep,
    ) -> None:
        self._client = client
        self._min_interval = min_interval_s
        self._jitter = jitter_s
        self._retries = retries
        self._backoff = backoff_s
        self._sleep = sleep
        self._lock = asyncio.Lock()
        self._last = float("-inf")
        self.requests = 0

    async def _pace(self) -> None:
        wait = self._last + self._min_interval + random.uniform(0, self._jitter) - time.monotonic()  # noqa: S311
        if wait > 0:
            await self._sleep(wait)
        self._last = time.monotonic()

    def _retry_delay(self, attempt: int, response: httpx.Response | None) -> float:
        if response is not None:
            header = response.headers.get("Retry-After", "")
            if header.isdigit():
                return min(float(header), MAX_RETRY_AFTER_S)
        return float(self._backoff * 2**attempt + random.uniform(0, self._jitter))  # noqa: S311

    async def get_json(self, url: str, *, params: Mapping[str, str] | None = None) -> Any:
        """GET → parsed JSON. 404 returns None (unknown/delisted symbol); other errors raise SourceError."""
        async with self._lock:
            last_error = "no attempt"
            for attempt in range(self._retries + 1):
                await self._pace()
                response: httpx.Response | None = None
                try:
                    self.requests += 1
                    response = await self._client.get(url, params=params)
                except (httpx.TimeoutException, httpx.TransportError) as exc:
                    last_error = f"{type(exc).__name__}"
                else:
                    if response.status_code == httpx.codes.NOT_FOUND:
                        return None
                    if response.status_code not in RETRY_STATUSES:
                        if response.is_error:
                            raise SourceError(f"{url}: HTTP {response.status_code}")
                        try:
                            return response.json()
                        except ValueError as exc:
                            raise SourceError(f"{url}: response is not JSON") from exc
                    last_error = f"HTTP {response.status_code}"
                if attempt < self._retries:
                    delay = self._retry_delay(attempt, response)
                    log.warning(
                        "price source retry %d/%d in %.1fs (%s): %s", attempt + 1, self._retries, delay, last_error, url
                    )
                    await self._sleep(delay)
            raise SourceError(f"{url}: giving up after {self._retries + 1} attempts ({last_error})")


def make_http_client(
    *, timeout_s: float = DEFAULT_TIMEOUT_S, transport: httpx.AsyncBaseTransport | None = None
) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(timeout_s, connect=15.0),
        headers={"User-Agent": USER_AGENT, "Accept": "application/json, text/plain, */*"},
        follow_redirects=True,
        transport=transport,
    )
