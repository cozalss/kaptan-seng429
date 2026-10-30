"""KAPTAN_SINGLE_USER ("tek kullanıcı modu"): one account (`sahip`) holds every permission and completes the
two-person flows alone; each waived second signature is audited as `auth.single_user_waiver`. With the
flag off the 403 `same_person` rule stands (test_risk / test_limits / test_broker_guard_live cover that,
the unit test below covers the helper)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from kaptan.api.errors import ApiError
from kaptan.auth.four_eyes import WAIVER_ACTION, second_signature
from kaptan.db import connect
from kaptan.demo.seed import reseed
from kaptan.settings import Settings
from tests.conftest import DEMO_PASSPHRASE, bearer, reseed_test_db
from tests.integration.ops_support import app_client

pytestmark = pytest.mark.integration

API = "/api/v1"


async def _rows(settings: Settings, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    conn = await connect(settings.database_url.get_secret_value())
    try:
        async with conn.cursor() as cur:
            await cur.execute(sql, params)
            rows = [dict(r) for r in await cur.fetchall()]
        await conn.rollback()
        return rows
    finally:
        await conn.close()


async def _login(http: httpx.AsyncClient, role: str | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"passphrase": DEMO_PASSPHRASE}
    if role:
        body["role"] = role
    res = await http.post(f"{API}/auth/login", json=body)
    assert res.status_code == 200, res.text
    out: dict[str, Any] = res.json()
    return out


async def test_one_person_does_everything_and_every_waiver_is_audited(migrated: Settings, seeded: object) -> None:
    single = migrated.model_copy(update={"kaptan_single_user": True, "login_rate_per_minute": 600})
    owner = await connect(single.database_owner_url.get_secret_value())  # type: ignore[union-attr]
    try:
        await reseed(owner, single_user=True)
    finally:
        await owner.close()
    try:
        async with app_client(single) as (http, _app):
            health = (await http.get(f"{API}/health")).json()
            assert health["single_user"] is True
            session = await _login(http, "analyst")
            assert session["user"]["id"] == "sahip"
            h = bearer(session["access_token"])
            # RBAC: the analyst screen may still stop the desk, propose and approve limits
            kill = await http.post(f"{API}/risk/kill-switch", json={"reason": "Tek kullanıcı testi."}, headers=h)
            assert kill.status_code == 200, kill.text
            start = await http.post(
                f"{API}/risk/kill-switch/reset/request", json={"reason": "Olay incelendi."}, headers=h
            )
            assert start.status_code == 200, start.text
            await _floor_drawdown(single)
            done = await http.post(
                f"{API}/risk/kill-switch/reset/confirm", json={"reason": "Kendi ikinci imzam."}, headers=h
            )
            assert done.status_code == 200, done.text
            assert done.json()["kill_switch"] == "off"
            prop = await http.post(
                f"{API}/limits/proposals",
                json={"key": "max_group_pct", "value": 0.15, "reason": "Tek kullanıcı limit değişikliği."},
                headers=h,
            )
            assert prop.status_code == 200, prop.text
            version = prop.json()["pending"]["version"]
            decided = await http.post(
                f"{API}/limits/proposals/{version}/decision",
                json={"decision": "approve", "comment": "Kendim onaylıyorum."},
                headers=h,
            )
            assert decided.status_code == 200, decided.text
            users = await http.get(f"{API}/admin/users", headers=h)
            assert users.status_code == 200
            assert [u["uid"] for u in users.json()] == ["sahip"]
        waivers = await _rows(
            single, "SELECT actor, payload FROM audit.audit_log WHERE action = %s ORDER BY chain_pos", (WAIVER_ACTION,)
        )
        assert [w["payload"]["flow"] for w in waivers] == ["kill_reset", "limits"]
        assert all(w["actor"] == "user:sahip" and w["payload"]["waiver"] == "single_user_waiver" for w in waivers)
    finally:
        await reseed_test_db(migrated)


async def _floor_drawdown(settings: Settings) -> None:
    conn = await connect(settings.database_url.get_secret_value())
    try:
        await conn.execute("UPDATE trading.risk_state SET drawdown_pct = -0.06")
        await conn.commit()
    finally:
        await conn.close()


async def test_the_flag_off_keeps_same_person_and_the_team(client: httpx.AsyncClient, migrated: Settings) -> None:
    assert (await client.get(f"{API}/health")).json()["single_user"] is False
    assert (await _login(client, "analyst"))["user"]["id"] == "uye-2"
    rows = await _rows(migrated, "SELECT is_active FROM auth.users WHERE uid = 'sahip'")
    assert rows == [{"is_active": False}]  # seeded, but not a user while the mode is off
    conn = await connect(migrated.database_url.get_secret_value())
    try:
        now = datetime(2027, 1, 11, 10, 40, tzinfo=UTC)
        with pytest.raises(ApiError) as e:
            await second_signature(
                conn, first_uid="uye-3", uid="uye-3", flow="limits", refusal="x", entity_type="t", entity_id="1",
                now=now, single_user=False,
            )  # fmt: skip
        assert e.value.code == "same_person"
        assert not await second_signature(
            conn, first_uid="uye-1", uid="uye-3", flow="limits", refusal="x", entity_type="t", entity_id="1", now=now
        )
    finally:
        await conn.rollback()
        await conn.close()
