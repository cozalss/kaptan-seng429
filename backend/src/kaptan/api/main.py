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
from typing import Any, Final

import redis.asyncio as aioredis
from fastapi import APIRouter, FastAPI, Request

from kaptan.agents.checkpoint import open_saver
from kaptan.api.errors import install_error_handlers
from kaptan.api.routers import (
    admin,
    approvals,
    audit,
    auth,
    brief,
    disclosures,
    eval,
    limits,
    personal,
    portfolio,
    risk,
    runs,
    sse,
    tickets,
)
from kaptan.brokers import config as broker_config
from kaptan.clock import Clock
from kaptan.db import create_pool
from kaptan.ops.health import health_router, log_migration_state
from kaptan.ops.http import RateLimitMiddleware, RequestContextMiddleware, SecurityHeadersMiddleware
from kaptan.ops.metrics import metrics_router
from kaptan.ops.system_status import system_status_router
from kaptan.settings import Settings, ensure_production_ready, get_settings, has_llm_provider

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
    sse.router,
    brief.router,  # backend-only: GET /brief/today|{date} (M3 B1)
    eval.router,  # backend-only: GET /eval/summary, /reports/forward/weekly (M3 B3)
    personal.router,  # backend-only: GET /personal/stage (M3 B3)
)


def _lifespan(settings: Settings) -> Any:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        ensure_production_ready(settings, "api")  # KAPTAN_ENV=prod: refuse an unsafe configuration
        app.state.settings = settings
        app.state.pool = create_pool(
            settings.database_url.get_secret_value(), min_size=settings.db_pool_min, max_size=settings.db_pool_max
        )
        await app.state.pool.open(wait=False)
        app.state.redis = aioredis.from_url(settings.redis_url.get_secret_value(), decode_responses=True)
        app.state.clock = Clock()
        await log_migration_state(app.state.pool)  # says clearly when the schema is not at head
        broker_config.install(settings)  # the order path's mode, costs, live keys (M3 A3)
        try:
            async with open_saver(settings):  # CHECKPOINTER=postgres: graph threads in agent_ckpt.*
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
            "llm_mode": s.llm_mode,
            "llm_ready": has_llm_provider(s),
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
    # Plain ASGI middleware (SSE streams pass through): the last added runs first.
    app.add_middleware(RateLimitMiddleware, prefix=API_PREFIX)
    app.add_middleware(
        SecurityHeadersMiddleware, hsts_max_age_s=settings.hsts_max_age_s if settings.kaptan_env == "prod" else None
    )
    app.add_middleware(RequestContextMiddleware)
    app.include_router(health_router())  # /healthz, /readyz (M3 A5)
    app.include_router(metrics_router())  # /metrics (METRICS_TOKEN or loopback)
    app.include_router(_health_router(), prefix=API_PREFIX)
    app.include_router(system_status_router(), prefix=API_PREFIX)
    for router in ROUTERS:
        app.include_router(router, prefix=API_PREFIX)
    return app


app = create_app()
