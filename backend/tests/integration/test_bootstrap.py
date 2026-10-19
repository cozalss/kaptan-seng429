"""`python -m kaptan.bootstrap`: a migrated, empty database becomes usable without the demo seed (FR-33)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

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
PASSWORD = "a-long-team-password-42"


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


async def test_dry_run_changes_nothing(conn: DictConn, migrated: Settings) -> None:
    rep = await bootstrap.bootstrap_data(conn, migrated, bootstrap.default_users(), environ={}, dry_run=True)
    assert "limits:v1" in rep.created
    assert await _count(conn, "auth.users") == 0
    assert await _count(conn, "audit.audit_log") == 0


async def test_bootstrap_is_idempotent_and_makes_the_api_usable(
    conn: DictConn, boot_db: str, migrated: Settings, tmp_path: Path
) -> None:
    users_file = tmp_path / "team.yaml"
    users_file.write_text(
        "users:\n"
        "  - {uid: uye-3, display_name: Ayşe, role: risk_officer, duty_tr: Risk, password_env: KAPTAN_PW_UYE_3}\n",
        encoding="utf-8",
    )
    users = bootstrap.load_users(users_file)
    env = {"KAPTAN_PW_UYE_3": PASSWORD}
    first = await bootstrap.bootstrap_data(conn, migrated, users, environ=env)
    assert {"user:uye-1", "user:uye-3", "user:denetci", "limits:v1", "risk_state", "live_arm", "quota:gemini"} <= set(
        first.created
    )
    second = await bootstrap.bootstrap_data(conn, migrated, users, environ=env)
    assert second.created == [] and second.updated == []
    assert await _count(conn, "audit.audit_log") == 1  # one system.bootstrap record, only for the first run
    async with conn.cursor() as cur:
        await cur.execute("SELECT display_name, password_hash FROM auth.users WHERE uid = 'uye-3'")
        row = await cur.fetchone()
        await cur.execute("SELECT key, value FROM trading.limits WHERE version = 1 ORDER BY ord")
        limits = [(r["key"], r["value"]) for r in await cur.fetchall()]
        await cur.execute("SELECT kill_switch FROM trading.risk_state")
        risk = await cur.fetchone()
        await cur.execute("SELECT config_live, env_enabled, ui_key, armed FROM trading.live_arm")
        arm = await cur.fetchone()
    assert row is not None and row["display_name"] == "Ayşe"
    assert str(row["password_hash"]).startswith("$argon2id$") and PASSWORD not in str(row["password_hash"])
    assert limits == [(k, float(v)) for k, v in LIMITS_V1]
    assert risk is not None and risk["kill_switch"] == "off"
    assert arm is not None and not any(arm.values())
    verdict = await verify_db(conn, "2026-10-20T00:00:00.000Z")
    assert verdict["ok"] and verdict["checked"] == 1
    await conn.commit()

    renamed = [u.model_copy(update={"display_name": "Ayşe Y."}) if u.uid == "uye-3" else u for u in users]
    third = await bootstrap.bootstrap_data(conn, migrated, renamed, environ=env)
    assert third.updated == ["user:uye-3"]

    app_url = scratch_db.sibling_url(migrated.database_url.get_secret_value(), DB)
    s = migrated.model_copy(
        update={
            "database_url": type(migrated.database_url)(app_url),
            "demo_mode": False,
            "trusted_proxies": ["127.0.0.1"],
        }
    )
    async with app_client(s) as (http, _):
        login = await http.post(
            "/api/v1/auth/login", json={"passphrase": DEMO_PASSPHRASE}, headers={"X-Forwarded-For": unique_ip()}
        )
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]
        limits_view = await http.get("/api/v1/limits", headers=bearer(token))
        ready = await http.get("/readyz")
    assert limits_view.status_code == 200, limits_view.text
    assert limits_view.json()["active"]["version"] == 1
    assert ready.status_code == 200


def test_users_file_validation(tmp_path: Path) -> None:
    bad_role = tmp_path / "a.json"
    bad_role.write_text(json.dumps({"users": [{"uid": "uye-1", "display_name": "X", "role": "analyst"}]}))
    with pytest.raises(ConfigError, match="uye-1 must keep the role admin"):
        bootstrap.load_users(bad_role)
    junk = tmp_path / "b.yaml"
    junk.write_text("users:\n  - {uid: 'Bad Uid', display_name: X, role: admin}\n", encoding="utf-8")
    with pytest.raises(ConfigError, match="users file"):
        bootstrap.load_users(junk)
    extra = bootstrap.load_users(None, json.dumps([{"uid": "uye-5", "display_name": "Beş", "role": "analyst"}]))
    assert "uye-5" in {u.uid for u in extra} and len(extra) == 6


def test_passwords_come_from_the_environment_only() -> None:
    user = bootstrap.UserSpec(uid="uye-2", display_name="İki", role="analyst", password_env="KAPTAN_PW_UYE_2")
    with pytest.raises(ConfigError, match="KAPTAN_PW_UYE_2"):
        bootstrap.password_of(user, {})
    with pytest.raises(ConfigError, match="at least 12"):
        bootstrap.password_of(user, {"KAPTAN_PW_UYE_2": "short"})
    assert bootstrap.password_of(user, {"KAPTAN_PW_UYE_2": PASSWORD}) == PASSWORD


async def test_roles_for_a_managed_postgres(boot_db: str) -> None:
    admin = await connect(boot_db, autocommit=True)
    try:
        with pytest.raises(ConfigError, match="KAPTAN_APP_PASSWORD"):
            await bootstrap.bootstrap_roles(admin, {})
        done = await bootstrap.bootstrap_roles(admin, {"KAPTAN_APP_PASSWORD": "x" * 16})  # existing role: kept
    finally:
        await admin.close()
    assert done == {"kaptan_app": "kept", "extension:vector": "ok", "extension:pg_trgm": "ok"}


async def test_the_cli_never_prints_a_password(
    boot_db: str, migrated: Settings, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("KAPTAN_PW_UYE_4", PASSWORD)
    monkeypatch.setenv(
        "KAPTAN_BOOTSTRAP_USERS",
        json.dumps([{"uid": "uye-4", "display_name": "Dört", "role": "analyst", "password_env": "KAPTAN_PW_UYE_4"}]),
    )
    s = migrated.model_copy(update={"database_owner_url": type(migrated.database_url)(boot_db), "demo_mode": False})
    assert await bootstrap._main(s, bootstrap.parse_args([])) == 0
    out = capsys.readouterr().out
    updated_line = next(line for line in out.splitlines() if line.startswith("updated:"))
    assert "user:uye-4" in updated_line
    assert PASSWORD not in out and "$argon2" not in out


def test_main_refuses_a_demo_database(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    demo = Settings.model_construct(kaptan_env="dev", demo_mode=True)
    monkeypatch.setattr(bootstrap, "get_settings", lambda: demo)
    assert bootstrap.main([]) == 2
    assert "seed_demo.py" in capsys.readouterr().err
