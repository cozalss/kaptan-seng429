"""One HTTP POST with timeouts, bounded retries and error classification for every live provider.

- 429 / 5xx / timeouts / connection errors are retried with exponential backoff + jitter
  (`Retry-After` honoured up to `MAX_WAIT_S`); a daily-quota 429 is not retried (it will not heal today).
- Any other 4xx is final for that provider (the chain moves on).
- Errors never carry request headers or bodies: keys travel only in headers and are never logged.
"""

from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any, Final

import httpx

from kaptan.llm.provider import ProviderError

log = logging.getLogger("kaptan.llm")

BASE_BACKOFF_S: Final = 0.5
MAX_WAIT_S: Final = 10.0
RETRYABLE_STATUS: Final = frozenset({408, 409, 429, 500, 502, 503, 504})
_DAILY_MARKERS: Final = ("perday", "per_day", "per day", "requests per day", "tokens per day", "daily")

Sleep = Callable[[float], Awaitable[None]]


class QuotaExhaustedError(ProviderError):
    """The provider says today's quota is used up: skip it for the rest of the day."""


class InvalidOutputError(ProviderError):
    """The model answered, but not with JSON matching the schema (eligible for one repair attempt)."""


@dataclass(frozen=True, slots=True)
class HttpReply:
    status: int
    body: Mapping[str, Any]
    latency_ms: int


def _is_daily_quota(resp: httpx.Response) -> bool:
    text = resp.text.lower().replace(" ", "") if resp.status_code == 429 else ""
    return any(m.replace(" ", "") in text for m in _DAILY_MARKERS)


def _retry_after(resp: httpx.Response) -> float | None:
    value = resp.headers.get("retry-after")
    if value is None:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        return None


def _backoff(attempt: int) -> float:
    return float(BASE_BACKOFF_S * (2**attempt) + random.uniform(0, BASE_BACKOFF_S))  # noqa: S311 - jitter only


def _short_error(resp: httpx.Response) -> str:
    """The provider's error message without echoing anything we sent."""
    try:
        data = resp.json()
    except ValueError:
        return f"HTTP {resp.status_code}"
    err = data.get("error") if isinstance(data, dict) else None
    msg = err.get("message") if isinstance(err, dict) else err
    return f"HTTP {resp.status_code}: {str(msg)[:200]}" if msg else f"HTTP {resp.status_code}"


async def post_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    provider: str,
    headers: Mapping[str, str],
    payload: Mapping[str, Any],
    timeout_s: float,
    max_retries: int,
    sleep: Sleep = asyncio.sleep,
) -> HttpReply:
    """POST `payload`; returns the JSON body of a 2xx reply or raises `ProviderError`."""
    loop = asyncio.get_running_loop()
    attempt = 0
    while True:
        started = loop.time()
        try:
            resp = await client.post(url, headers=dict(headers), json=dict(payload), timeout=timeout_s)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            if attempt >= max_retries:
                raise ProviderError(f"{provider}: {type(exc).__name__}", provider=provider) from None
            await sleep(_backoff(attempt))
            attempt += 1
            continue
        latency_ms = int((loop.time() - started) * 1000)
        if resp.is_success:
            try:
                body = resp.json()
            except ValueError:
                raise ProviderError(f"{provider}: non-JSON reply", provider=provider) from None
            return HttpReply(resp.status_code, body if isinstance(body, dict) else {"data": body}, latency_ms)
        if resp.status_code == 429 and _is_daily_quota(resp):
            raise QuotaExhaustedError(f"{provider}: daily quota exhausted", provider=provider)
        if resp.status_code == 400 and "json_validate_failed" in resp.text:  # Groq: output broke the schema
            raise InvalidOutputError(f"{provider}: model output failed JSON validation", provider=provider)
        if resp.status_code not in RETRYABLE_STATUS or attempt >= max_retries:
            log.warning("llm provider %s failed: %s", provider, _short_error(resp))
            raise ProviderError(f"{provider}: {_short_error(resp)}", provider=provider)
        wait = _retry_after(resp)
        if wait is not None and wait > MAX_WAIT_S:
            raise ProviderError(f"{provider}: rate limited for {wait:.0f}s", provider=provider)
        await sleep(wait if wait is not None else _backoff(attempt))
        attempt += 1
