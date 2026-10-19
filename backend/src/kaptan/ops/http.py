"""ASGI middleware for the API: request id + access log, security headers, rate limiting of mutations.

All three are plain ASGI (no BaseHTTPMiddleware), so streaming responses (SSE) pass through untouched:
headers are added to `http.response.start`, bodies are never buffered.

- `RequestContextMiddleware`: `X-Request-ID` (the caller's if it is a sane token, else a new one) in the
  log context and on the response; one access-log line per request (path without the query string:
  SSE tickets travel there).
- `SecurityHeadersMiddleware` (09 §6): nosniff, X-Frame-Options DENY, CSP `frame-ancestors 'none'`,
  Referrer-Policy no-referrer; HSTS only with KAPTAN_ENV=prod.
- `RateLimitMiddleware` (NFR-09): POST/PUT/PATCH/DELETE under /api/v1 (login has its own, stricter
  limit) at MUTATION_RATE_PER_MINUTE per user (the access token's `sub`) or per client IP.
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any, Final

from kaptan.auth.ratelimit import (
    IpNetwork,
    Limiter,
    RedisRateLimiter,
    SlidingWindowLimiter,
    client_ip,
    parse_networks,
)
from kaptan.auth.tokens import InvalidTokenError, decode_access_token
from kaptan.ops.logs import request_id_var
from kaptan.settings import Settings

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

access_log = logging.getLogger("kaptan.access")

REQUEST_ID_HEADER: Final = "x-request-id"
REQUEST_ID_RE: Final = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
MUTATING: Final = frozenset({"POST", "PUT", "PATCH", "DELETE"})
#: Paths with their own limiter (login) or none at all.
RATE_EXEMPT: Final = frozenset({"/api/v1/auth/login"})
RATE_LIMITED_JSON: Final = '{"detail":"Çok fazla istek. Biraz sonra yeniden deneyin.","code":"rate_limited"}'.encode()
SECURITY_HEADERS: Final[tuple[tuple[bytes, bytes], ...]] = (
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"content-security-policy", b"frame-ancestors 'none'"),
    (b"referrer-policy", b"no-referrer"),
)


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers") or []:
        if key == name:
            return bytes(value).decode("latin-1")
    return None


def _with_headers(message: Message, extra: list[tuple[bytes, bytes]]) -> Message:
    present = {k.lower() for k, _ in message.get("headers") or []}
    headers = list(message.get("headers") or []) + [(k, v) for k, v in extra if k not in present]
    return {**message, "headers": headers}


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        given = _header(scope, REQUEST_ID_HEADER.encode())
        rid = given if given and REQUEST_ID_RE.match(given) else uuid.uuid4().hex
        token = request_id_var.set(rid)
        started = time.perf_counter()
        status = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = int(message["status"])
                message = _with_headers(message, [(REQUEST_ID_HEADER.encode(), rid.encode())])
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            access_log.info(
                "%s %s %d",
                scope.get("method", "-"),
                scope.get("path", "-"),
                status,
                extra={"duration_ms": round((time.perf_counter() - started) * 1000, 1), "status": status},
            )
            request_id_var.reset(token)


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, *, hsts_max_age_s: int | None = None) -> None:
        self.app = app
        extra = list(SECURITY_HEADERS)
        if hsts_max_age_s:
            extra.append((b"strict-transport-security", f"max-age={hsts_max_age_s}; includeSubDomains".encode()))
        self.extra = extra

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                message = _with_headers(message, self.extra)
            await send(message)

        await self.app(scope, receive, send_wrapper)


def use_redis_limiter(settings: Settings) -> bool:
    if settings.rate_limit_backend == "auto":
        return settings.kaptan_env == "prod"
    return settings.rate_limit_backend == "redis"


def mutation_limit(settings: Settings) -> int:
    """The e2e override (LOGIN_RATE_PER_MINUTE=600) raises the mutation limit with it."""
    return max(settings.mutation_rate_per_minute, settings.login_rate_per_minute)


def make_limiter(settings: Settings, redis: Any, limit: int) -> Limiter:
    if use_redis_limiter(settings) and redis is not None:
        return RedisRateLimiter(redis=redis, limit=limit)
    return SlidingWindowLimiter(limit=limit)


def app_limiter(app: Any, name: str, limit: int) -> Limiter:
    """One limiter per app and purpose (`login`, `mutation`), created on first use (Redis exists by then)."""
    attr = f"{name}_limiter"
    limiter: Limiter | None = getattr(app.state, attr, None)
    if limiter is None:
        limiter = make_limiter(app.state.settings, getattr(app.state, "redis", None), limit)
        setattr(app.state, attr, limiter)
    return limiter


def trusted_networks(app: Any) -> tuple[IpNetwork, ...]:
    nets: tuple[IpNetwork, ...] | None = getattr(app.state, "trusted_networks", None)
    if nets is None:
        nets = parse_networks(app.state.settings.trusted_proxies)
        app.state.trusted_networks = nets
    return nets


def request_ip(app: Any, peer: str | None, forwarded_for: str | None) -> str:
    return client_ip(peer, forwarded_for, trusted_networks(app))


def _caller_key(app: Any, scope: Scope) -> str:
    auth = _header(scope, b"authorization") or ""
    scheme, _, token = auth.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        try:
            return f"user:{decode_access_token(app.state.settings, token.strip()).uid}"
        except InvalidTokenError:
            pass  # the route answers 401; the IP still pays for the attempt
    peer = (scope.get("client") or (None, None))[0]
    return f"ip:{request_ip(app, peer, _header(scope, b'x-forwarded-for'))}"


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp, *, prefix: str = "/api/v1") -> None:
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if (
            scope["type"] != "http"
            or scope.get("method") not in MUTATING
            or not path.startswith(self.prefix)
            or path in RATE_EXEMPT
        ):
            await self.app(scope, receive, send)
            return
        app = scope["app"]
        limiter = app_limiter(app, "mutation", mutation_limit(app.state.settings))
        if await limiter.hit(f"mut:{_caller_key(app, scope)}"):
            await self.app(scope, receive, send)
            return
        await send(
            {
                "type": "http.response.start",
                "status": 429,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(RATE_LIMITED_JSON)).encode()),
                    (b"retry-after", b"60"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": RATE_LIMITED_JSON})
