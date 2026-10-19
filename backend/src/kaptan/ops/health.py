"""Liveness and readiness (M3 A5).

    GET /healthz -> 200 {"status": "ok"}                         (the process answers; no I/O)
    GET /readyz  -> 200 | 503 {"status", "checks": {db, redis, migrations}, "workers": {...}}

`/readyz` is 503 when Postgres or Redis does not answer within 2 s, or when the database is not at the
alembic head of this image (`migrations/`). Worker heartbeats are reported, never decisive. Nothing
secret is returned (no URLs, no versions of other software). The existing `/api/v1/health` is untouched.
"""

from __future__ import annotations

import asyncio
import logging
from functools import lru_cache
from typing import Any, Final

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from kaptan.ops.heartbeat import read_heartbeats
from kaptan.settings import BACKEND_DIR

log = logging.getLogger("kaptan.ops.health")

CHECK_TIMEOUT_S: Final = 2.0
ALEMBIC_INI: Final = BACKEND_DIR / "alembic.ini"
VERSION_SQL: Final = "SELECT version_num FROM public.alembic_version"


@lru_cache(maxsize=1)
def code_heads() -> frozenset[str]:
    """The alembic head revision(s) this code ships (read once per process)."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    return frozenset(ScriptDirectory.from_config(Config(str(ALEMBIC_INI))).get_heads())


async def db_revisions(conn: Any) -> frozenset[str]:
    async with conn.cursor() as cur:
        await cur.execute(VERSION_SQL)
        rows = await cur.fetchall()
    await conn.rollback()
    return frozenset(str(r["version_num"] if isinstance(r, dict) else r[0]) for r in rows)


def migration_state(db: frozenset[str], code: frozenset[str]) -> str:
    """ok | behind (the database misses heads of this code) | ahead (unknown revisions: newer code ran)."""
    if db == code:
        return "ok"
    return "ahead" if db - code else "behind"


async def check_db(pool: Any) -> tuple[bool, str]:
    """(db reachable, migration state)."""
    try:
        async with pool.connection(timeout=CHECK_TIMEOUT_S) as conn:
            await asyncio.wait_for(conn.execute("SELECT 1"), timeout=CHECK_TIMEOUT_S)
            try:
                revisions = await asyncio.wait_for(db_revisions(conn), timeout=CHECK_TIMEOUT_S)
            except Exception as exc:  # no table / no grant (migration 0017) = not migrated
                log.warning("readyz: alembic version unreadable: %s", type(exc).__name__)
                await conn.rollback()
                return True, "unknown"
    except Exception as exc:
        log.warning("readyz: database check failed: %s", type(exc).__name__)
        return False, "unknown"
    return True, migration_state(revisions, code_heads())


async def check_redis(redis: Any) -> bool:
    try:
        return bool(await asyncio.wait_for(redis.ping(), timeout=CHECK_TIMEOUT_S))
    except Exception as exc:
        log.warning("readyz: redis check failed: %s", type(exc).__name__)
        return False


async def readiness(app: Any) -> tuple[bool, dict[str, Any]]:
    (db_ok, migrations), redis_ok = await asyncio.gather(check_db(app.state.pool), check_redis(app.state.redis))
    workers: dict[str, Any] = {}
    if redis_ok:
        try:
            workers = await read_heartbeats(app.state.redis)
        except Exception as exc:
            log.warning("readyz: heartbeats unreadable: %s", type(exc).__name__)
    ready = db_ok and redis_ok and migrations == "ok"
    body = {
        "status": "ready" if ready else "not_ready",
        "checks": {"db": "ok" if db_ok else "down", "redis": "ok" if redis_ok else "down", "migrations": migrations},
        "workers": workers,
    }
    return ready, body


async def log_migration_state(pool: Any) -> str:
    """Startup: say loudly when the database is not at this code's head (the app still starts)."""
    db_ok, state = await check_db(pool)
    if not db_ok:
        log.warning("startup: database unreachable; migrations not checked")
    elif state != "ok":
        log.error(
            "startup: database schema is %s (code head %s); run the migrate job "
            "(docker compose run --rm migrate, or `uv run alembic upgrade head`)",
            state,
            ",".join(sorted(code_heads())),
        )
    else:
        log.info("startup: database schema at head %s", ",".join(sorted(code_heads())))
    return state


def health_router() -> APIRouter:
    router = APIRouter(tags=["health"])

    @router.get("/healthz", include_in_schema=False)
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @router.get("/readyz", include_in_schema=False)
    async def readyz(request: Request) -> JSONResponse:
        ready, body = await readiness(request.app)
        return JSONResponse(body, status_code=200 if ready else 503)

    return router
