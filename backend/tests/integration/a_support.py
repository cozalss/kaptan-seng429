"""Shared helpers for package A's integration tests (approvals, runs, tickets)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx
import pytest

from kaptan.api.main import API_PREFIX
from kaptan.approvals.execute import wait_for_fills
from kaptan.db import connect
from kaptan.demo.seed import SeedResult
from kaptan.domain.roles import Role
from kaptan.settings import Settings
from tests.conftest import bearer, login, reseed_test_db

EXPECTED = Path(__file__).resolve().parents[1] / "fixtures" / "demo" / "expected"
DEMO_E3_RUN = "run-demo-e3-ornek"
DEMO_E3_PROPOSAL = "prop-demo-e3-ornek"
DEMO_TICKET = "T-2027-0111-003"


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
    await wait_for_fills()
    await reseed_test_db(migrated)


_TOKENS: dict[Role, str] = {}


async def token(http: httpx.AsyncClient, role: Role) -> str:
    """One login per role per session (the login rate limit is 5/min); access tokens are plain JWTs."""
    if role not in _TOKENS:
        _TOKENS[role] = (await login(http, role))["access_token"]
    return _TOKENS[role]


async def call(http: httpx.AsyncClient, role: Role, method: str, path: str, body: Any = None) -> httpx.Response:
    headers = bearer(await token(http, role))
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
