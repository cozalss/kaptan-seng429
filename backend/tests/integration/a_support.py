"""Shared helpers for package A's integration tests (approvals, runs, tickets)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from psycopg.types.json import Jsonb

from kaptan.api.main import API_PREFIX
from kaptan.db import DictConn, connect
from kaptan.domain.schemas import iso_ms
from kaptan.settings import Settings
from tests.conftest import bearer, login, reseed_test_db
from tests.harness.seed import SeedResult

WAIT_OVER = timedelta(days=30)
EXPECTED = Path(__file__).resolve().parents[1] / "fixtures" / "demo" / "expected"
DEMO_E3_RUN = "run-demo-e3-ornek"
DEMO_E3_PROPOSAL = "prop-demo-e3-ornek"
DEMO_TICKET = "T-2027-0111-013"  # the running number: 10 + the three seeded tickets


async def as_if_the_wait_is_over(conn: DictConn) -> None:
    """A stop and its restart request, thirty days old: the 24 h and 5 sessions have passed."""
    async with conn.cursor() as cur:
        await cur.execute("SELECT kill_at, reset_started FROM trading.risk_state")
        row = await cur.fetchone()
    assert row is not None
    started = row["reset_started"]
    moved = datetime.fromisoformat(started["at"].replace("Z", "+00:00")) - WAIT_OVER
    await conn.execute(
        "UPDATE trading.risk_state SET kill_at = %s, reset_started = %s",
        (row["kill_at"] - WAIT_OVER, Jsonb({**started, "at": iso_ms(moved)})),
    )
    await conn.commit()


def expected(name: str) -> Any:
    return json.loads((EXPECTED / name).read_text(encoding="utf-8"))


def normalise(value: Any) -> Any:
    """JSON with `cancel_reason: null` dropped (zod's nullish: absent and null are the same)."""
    if isinstance(value, dict):
        return {k: normalise(v) for k, v in value.items() if not (k == "cancel_reason" and v is None)}
    if isinstance(value, list):
        return [normalise(v) for v in value]
    return value


@pytest.fixture
async def fresh(migrated: Settings, seeded: SeedResult) -> SeedResult:
    """A fresh demo seed before the test (the app's clock is created after it, so it reads 13:40)."""
    return await reseed_test_db(migrated)


@pytest.fixture
async def api(fresh: SeedResult, client: httpx.AsyncClient, migrated: Settings) -> AsyncIterator[httpx.AsyncClient]:
    """`client` on a fresh seed; the test database is reseeded again afterwards (tests mutate it)."""
    yield client
    await reseed_test_db(migrated)


_TOKEN: list[str] = []


async def token(http: httpx.AsyncClient) -> str:
    """One login per session (the login rate limit is 5/min); access tokens are plain JWTs."""
    if not _TOKEN:
        _TOKEN.append((await login(http))["access_token"])
    return _TOKEN[0]


async def call(http: httpx.AsyncClient, method: str, path: str, body: Any = None) -> httpx.Response:
    headers = bearer(await token(http))
    return await http.request(method, f"{API_PREFIX}{path}", json=body, headers=headers)


async def sql(settings: Settings, statement: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    """Run one statement as the app role and commit (test setup: kill switch, injection, ...)."""
    conn = await connect(settings.database_url.get_secret_value())
    try:
        async with conn.cursor() as cur:
            await cur.execute(statement, params)
            rows = await cur.fetchall() if cur.description else []
        await conn.commit()
        return rows
    finally:
        await conn.close()


async def inject_demo_e3(settings: Settings, *, seconds_ago: float) -> None:
    """What package E's injection does to the run row: visible, injected `seconds_ago` (wall clock)."""
    await sql(
        settings,
        "UPDATE trading.agent_runs SET visible = true, injected_at = now() - make_interval(secs => %s) "
        "WHERE run_id = %s",
        (seconds_ago, DEMO_E3_RUN),
    )
