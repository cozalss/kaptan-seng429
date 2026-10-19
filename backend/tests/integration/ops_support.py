"""Helpers for the ops tests (M3 A5): an app + client with custom settings, a unique client IP."""

from __future__ import annotations

import itertools
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from asgi_lifespan import LifespanManager
from fastapi import FastAPI

from kaptan.api.deps import settings_dep
from kaptan.api.main import create_app
from kaptan.settings import Settings

_ips = itertools.count(1)


def unique_ip() -> str:
    """A documentation-range IP per call (and per process), so Redis rate-limit keys never collide."""
    n = next(_ips) + (os.getpid() % 200) * 1000
    return f"198.51.{(n // 250) % 250}.{n % 250 + 1}"


@asynccontextmanager
async def app_client(
    settings: Settings, *, client: tuple[str, int] = ("127.0.0.1", 50000)
) -> AsyncIterator[tuple[httpx.AsyncClient, FastAPI]]:
    app = create_app(settings)
    app.dependency_overrides[settings_dep] = lambda: settings
    async with LifespanManager(app) as manager:
        transport = httpx.ASGITransport(app=manager.app, client=client)
        async with httpx.AsyncClient(transport=transport, base_url="https://testserver") as http:
            yield http, app
