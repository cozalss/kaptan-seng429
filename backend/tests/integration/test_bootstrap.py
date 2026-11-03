"""`python -m kaptan.bootstrap`: a migrated, empty database becomes usable without the demo seed (FR-33)."""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator

import pytest

from kaptan import bootstrap
from kaptan.audit.verify import verify_db
from kaptan.db import DictConn, connect
from kaptan.domain.schemas.governance import LIMITS_V1
from kaptan.settings import ConfigError, Settings
from tests.conftest import DEMO_PASSPHRASE, bearer
from tests.integration import scratch_db
from tests.integration.ops_support import app_client, unique_ip

pytestmark = pytest.mark.integration

DB = "kaptan_test_p_boot"


@pytest.fixture(scope="module")
def boot_db(migrated: Settings) -> Iterator[str]:
    owner = migrated.database_owner_url
    assert owner is not None
    url = scratch_db.recreate(owner.get_secret_value(), DB)
    scratch_db.migrate(url)
    yield url
    scratch_db.drop(owner.get_secret_value(), DB)


@pytest.fixture
async def conn(boot_db: str) -> AsyncIterator[DictConn]:
    c = await connect(boot_db)
    try:
        yield c
    finally:
        await c.close()


async def _count(conn: DictConn, table: str) -> int:
    async with conn.cursor() as cur:
        await cur.execute(f"SELECT count(*) AS n FROM {table}")  # noqa: S608 - test constant
        row = await cur.fetchone()
    assert row is not None
    return int(row["n"])


async def test_the_migration_creates_the_one_account(conn: DictConn) -> None:
    async with conn.cursor() as cur:
        await cur.execute("SELECT uid, display_name, is_active FROM auth.users")
        rows = await cur.fetchall()
    assert rows == [{"uid": "sahip", "display_name": "Sahip", "is_active": True}]


async def test_dry_run_changes_nothing(conn: DictConn, migrated: Settings) -> None:
    rep = await bootstrap.bootstrap_data(conn, migrated, dry_run=True)
    assert "limits:v1" in rep.created
    assert await _count(conn, "trading.limit_versions") == 0
    assert await _count(conn, "audit.audit_log") == 0


async def test_bootstrap_is_idempotent_and_makes_the_api_usable(
    conn: DictConn, boot_db: str, migrated: Settings
) -> None:
    first = await bootstrap.bootstrap_data(conn, migrated)
    assert {"limits:v1", "risk_state", "live_arm", "quota:gemini"} <= set(first.created)
    second = await bootstrap.bootstrap_data(conn, migrated)
    assert second.created == [] and second.updated == []
    assert await _count(conn, "audit.audit_log") == 1  # one system.bootstrap record, only for the first run
    async with conn.cursor() as cur:
        await cur.execute("SELECT key, value FROM trading.limits WHERE version = 1 ORDER BY ord")
        limits = [(r["key"], r["value"]) for r in await cur.fetchall()]
        await cur.execute("SELECT proposed_by, decided_by FROM trading.limit_versions WHERE version = 1")
        signed = await cur.fetchone()
        await cur.execute("SELECT kill_switch FROM trading.risk_state")
        risk = await cur.fetchone()
        await cur.execute("SELECT config_live, env_enabled, ui_key, armed FROM trading.live_arm")
        arm = await cur.fetchone()
    assert limits == [(k, float(v)) for k, v in LIMITS_V1]
    assert signed is not None
    assert (signed["proposed_by"]["uid"], signed["decided_by"]["uid"]) == ("kurulum", "sahip")
    assert risk is not None and risk["kill_switch"] == "off"
    assert arm is not None and not any(arm.values())
    verdict = await verify_db(conn, "2026-10-20T00:00:00.000Z")
    assert verdict["ok"] and verdict["checked"] == 1
    await conn.commit()

    app_url = scratch_db.sibling_url(migrated.database_url.get_secret_value(), DB)
    s = migrated.model_copy(
        update={
            "database_url": type(migrated.database_url)(app_url),
            "trusted_proxies": ["127.0.0.1"],
        }
    )
    async with app_client(s) as (http, _):
        login = await http.post(
            "/api/v1/auth/login", json={"passphrase": DEMO_PASSPHRASE}, headers={"X-Forwarded-For": unique_ip()}
        )
        assert login.status_code == 200, login.text
        assert login.json()["user"] == {"id": "sahip", "display_name": "Sahip"}
        token = login.json()["access_token"]
        limits_view = await http.get("/api/v1/limits", headers=bearer(token))
        ready = await http.get("/readyz")
    assert limits_view.status_code == 200, limits_view.text
    assert limits_view.json()["active"]["version"] == 1
    assert ready.status_code == 200


async def test_roles_for_a_managed_postgres(boot_db: str) -> None:
    admin = await connect(boot_db, autocommit=True)
    try:
        with pytest.raises(ConfigError, match="KAPTAN_APP_PASSWORD"):
            await bootstrap.bootstrap_roles(admin, {})
        done = await bootstrap.bootstrap_roles(admin, {"KAPTAN_APP_PASSWORD": "x" * 16})  # existing role: kept
    finally:
        await admin.close()
    assert done == {"kaptan_app": "kept", "extension:vector": "ok", "extension:pg_trgm": "ok"}


async def test_the_cli_reports_what_it_kept(
    boot_db: str, migrated: Settings, capsys: pytest.CaptureFixture[str]
) -> None:
    s = migrated.model_copy(update={"database_owner_url": type(migrated.database_url)(boot_db)})
    assert await bootstrap._main(s, bootstrap.parse_args([])) == 0
    out = capsys.readouterr().out
    kept = next(line for line in out.splitlines() if line.startswith("already there:"))
    assert "limits" in kept and "risk_state" in kept
