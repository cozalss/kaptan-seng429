"""The FastAPI app: everything under /api/v1, one error envelope, no CORS (the panel proxies /api/v1).

Run (Windows needs the selector loop for psycopg's async mode):
    uv run uvicorn kaptan.api.main:app --port 8000 --loop kaptan.api.loop:selector_loop
    uv run python -m kaptan.api            # same, with the loop chosen for you
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Final

import redis.asyncio as aioredis
from fastapi import APIRouter, FastAPI, Request

from kaptan.api.errors import install_error_handlers
from kaptan.api.routers import (
    admin,
    approvals,
    audit,
    auth,
    demo,
    disclosures,
    limits,
    portfolio,
    risk,
    runs,
    sse,
    tickets,
)
from kaptan.clock import Clock
from kaptan.db import create_pool
from kaptan.settings import Settings, get_settings

API_PREFIX: Final = "/api/v1"
log = logging.getLogger("kaptan.api")

ROUTERS: Final = (
    auth.router,
    disclosures.router,
    approvals.router,
    runs.router,
    tickets.router,
    portfolio.router,
    risk.router,
    limits.router,
    audit.router,
    admin.router,
    demo.router,
    sse.router,
)


async def load_demo_started_at(app: FastAPI) -> datetime | None:
    """ops.demo_state.started_at (written by the seed / demo reset); None if not seeded yet."""
    try:
        async with app.state.pool.connection() as conn, conn.cursor() as cur:
            await cur.execute("SELECT started_at FROM ops.demo_state WHERE id = 1")
            row = await cur.fetchone()
    except Exception:
        log.warning("demo clock: ops.demo_state unavailable; starting the demo clock now")
        return None
    return None if row is None else row["started_at"]


def _lifespan(settings: Settings) -> Any:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = settings
        app.state.pool = create_pool(
            settings.database_url.get_secret_value(), min_size=settings.db_pool_min, max_size=settings.db_pool_max
        )
        await app.state.pool.open(wait=False)
        app.state.redis = aioredis.from_url(settings.redis_url.get_secret_value(), decode_responses=True)
        app.state.clock = Clock(demo=settings.demo_mode)
        if settings.demo_mode:
            app.state.clock.started_at = await load_demo_started_at(app)
        try:
            yield
        finally:
            await app.state.redis.aclose()
            await app.state.pool.close()

    return lifespan


def _health_router() -> APIRouter:
    router = APIRouter(tags=["health"])

    @router.get("/health")
    async def health(request: Request) -> dict[str, Any]:
        """Liveness + dependencies. No auth; reveals nothing secret."""
        state = request.app.state
        db_ok = False
        try:
            async with state.pool.connection(timeout=2) as conn:
                await conn.execute("SELECT 1")
            db_ok = True
        except Exception:
            db_ok = False
        try:
            redis_ok = bool(await asyncio.wait_for(state.redis.ping(), timeout=2))
        except Exception:
            redis_ok = False
        s: Settings = state.settings
        return {
            "status": "ok" if db_ok else "degraded",
            "db": "ok" if db_ok else "down",
            "redis": "ok" if redis_ok else "down",
            "demo_mode": s.demo_mode,
            "llm_mode": s.llm_mode,
            "now": state.clock.now().isoformat(),
        }

    return router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="KAPtan API",
        version="0.1.0",
        lifespan=_lifespan(settings),
        docs_url=f"{API_PREFIX}/docs" if settings.kaptan_env != "prod" else None,
        openapi_url=f"{API_PREFIX}/openapi.json" if settings.kaptan_env != "prod" else None,
        redoc_url=None,
    )
    install_error_handlers(app)
    app.include_router(_health_router(), prefix=API_PREFIX)
    for router in ROUTERS:
        app.include_router(router, prefix=API_PREFIX)
    return app


app = create_app()
