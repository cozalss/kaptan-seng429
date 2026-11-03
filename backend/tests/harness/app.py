"""The API app on the fixture day: the production `create_app()` with the fixed clock swapped in after startup.

The swap wraps the app's lifespan from the outside, so production code has no seam for it.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI

from kaptan.api.main import create_app
from kaptan.settings import Settings
from tests.harness.clock import FixedDayClock


async def seeded_at(app: FastAPI) -> datetime | None:
    """ops.demo_state.started_at (written by the seed); None when the database was not seeded."""
    async with app.state.pool.connection() as conn, conn.cursor() as cur:
        await cur.execute("SELECT started_at FROM ops.demo_state WHERE id = 1")
        row = await cur.fetchone()
    return None if row is None else row["started_at"]


def on_fixture_day(app: FastAPI) -> FastAPI:
    """After the app's own startup, `app.state.clock` reads the fixture day."""
    inner = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(started: FastAPI) -> AsyncIterator[None]:
        async with inner(started):
            started.state.clock = FixedDayClock(started_at=await seeded_at(started))
            yield

    app.router.lifespan_context = lifespan
    return app


def create_test_app(settings: Settings) -> FastAPI:
    return on_fixture_day(create_app(settings))
