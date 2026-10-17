"""Shared fixtures.

- Unit tests need nothing running.
- Integration tests (`pytest.mark.integration` or the `pg` / `client` fixtures) migrate and seed the
  compose Postgres *test* database (TEST_DATABASE_URL / TEST_DATABASE_OWNER_URL); they are skipped
  when it is unreachable. Never the dev database.
- `client` is an httpx client on the ASGI app (lifespan on), base URL https so Secure cookies flow.
- psycopg async needs a selector loop on Windows: see `pytest_asyncio_loop_factories`.
"""

from __future__ import annotations

import argparse
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from asgi_lifespan import LifespanManager
from pydantic import SecretStr

from kaptan.api.deps import settings_dep
from kaptan.api.loop import selector_loop_factory
from kaptan.api.main import create_app
from kaptan.db import DictConn, connect
from kaptan.demo.seed import SeedResult, reseed
from kaptan.domain.roles import Role
from kaptan.settings import Settings, get_settings
from tests.contract.harness import node_available

BACKEND = Path(__file__).resolve().parents[1]
TEST_JWT_SECRET = "test-only-jwt-secret-0123456789-abcdefghijklmnop"
DEMO_PASSPHRASE = "kaptan2026"


def pytest_asyncio_loop_factories(config: pytest.Config, item: pytest.Item) -> dict[str, Any]:
    """Every async test and fixture runs on a selector loop (psycopg async refuses Proactor on Windows)."""
    return {"selector": selector_loop_factory()}


@pytest.fixture(scope="session")
def test_settings() -> Settings:
    base = get_settings()
    if base.test_database_url is None or base.test_database_owner_url is None:
        pytest.skip("TEST_DATABASE_URL / TEST_DATABASE_OWNER_URL not configured")
    return base.model_copy(
        update={
            "kaptan_env": "dev",
            "database_url": base.test_database_url,
            "database_owner_url": base.test_database_owner_url,
            "jwt_secret": SecretStr(TEST_JWT_SECRET),
            "passphrase_hash": None,
            "demo_mode": True,
            "demo_live_ticker": False,  # tests drive the ticker explicitly (package C)
            "cookie_secure": True,
            "allowed_origins": ["http://localhost:3100"],
            "db_pool_min": 1,
            "db_pool_max": 4,
        }
    )


@pytest.fixture(scope="session")
def migrated(test_settings: Settings) -> Settings:
    """`alembic -x db=test upgrade head` once per session (skips when Postgres is down)."""
    import psycopg
    from alembic import command
    from alembic.config import Config

    owner = test_settings.database_owner_url
    assert owner is not None
    try:
        with psycopg.connect(owner.get_secret_value(), connect_timeout=3):
            pass
    except psycopg.OperationalError as exc:
        pytest.skip(f"compose Postgres unreachable: {exc}")
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.cmd_opts = argparse.Namespace(x=["db=test"])
    command.upgrade(cfg, "head")
    return test_settings


@pytest.fixture(scope="session")
async def seeded(migrated: Settings) -> SeedResult:
    """The demo day loaded once per session into the test database."""
    return await reseed_test_db(migrated)


async def reseed_test_db(settings: Settings) -> SeedResult:
    owner = settings.database_owner_url
    assert owner is not None
    conn = await connect(owner.get_secret_value())
    try:
        return await reseed(conn)
    finally:
        await conn.close()


@pytest.fixture
async def pg(seeded: SeedResult, migrated: Settings) -> AsyncIterator[DictConn]:
    """An app-role connection to the seeded test database (rolled back afterwards)."""
    conn = await connect(migrated.database_url.get_secret_value())
    try:
        yield conn
    finally:
        await conn.rollback()
        await conn.close()


@pytest.fixture
async def owner_pg(seeded: SeedResult, migrated: Settings) -> AsyncIterator[DictConn]:
    owner = migrated.database_owner_url
    assert owner is not None
    conn = await connect(owner.get_secret_value())
    try:
        yield conn
    finally:
        await conn.rollback()
        await conn.close()


@pytest.fixture
async def client(seeded: SeedResult, migrated: Settings) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(migrated)
    app.dependency_overrides[settings_dep] = lambda: migrated
    async with LifespanManager(app) as manager:
        transport = httpx.ASGITransport(app=manager.app)
        async with httpx.AsyncClient(transport=transport, base_url="https://testserver") as http:
            yield http


async def login(http: httpx.AsyncClient, role: Role | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"passphrase": DEMO_PASSPHRASE}
    if role is not None:
        body["role"] = role
    res = await http.post("/api/v1/auth/login", json=body)
    assert res.status_code == 200, res.text
    data: dict[str, Any] = res.json()
    return data


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def require_node() -> Iterator[None]:
    if not node_available():
        pytest.skip("node or kaptan-panel/node_modules not available")
    yield
