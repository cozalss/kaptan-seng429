"""One person runs KAPtan: signed in = allowed, and every waived second signature is on record as
`auth.single_user_waiver`. The restart always waits."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pytest

from kaptan.audit.verify import verify_db
from kaptan.auth.four_eyes import WAIVER_ACTION, second_signature
from kaptan.clock import Clock
from kaptan.db import connect
from kaptan.domain.schemas import iso_ms
from kaptan.settings import Settings
from tests.conftest import DEMO_PASSPHRASE, bearer, reseed_test_db
from tests.integration.a_support import as_if_the_wait_is_over
from tests.integration.ops_support import app_client, unique_ip

pytestmark = pytest.mark.integration

API = "/api/v1"
NO_LIMITS = {"login_rate_per_minute": 600, "trusted_proxies": ["127.0.0.1/32"]}


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


async def _floor_drawdown(settings: Settings) -> None:
    conn = await connect(settings.database_url.get_secret_value())
    try:
        await conn.execute("UPDATE trading.risk_state SET drawdown_pct = -0.06")
        await conn.commit()
    finally:
        await conn.close()


async def _wait_over(settings: Settings) -> None:
    conn = await connect(settings.database_url.get_secret_value())
    try:
        await as_if_the_wait_is_over(conn)
    finally:
        await conn.close()


async def _session_headers(http: Any) -> dict[str, str]:
    res = await http.post(
        f"{API}/auth/login", json={"passphrase": DEMO_PASSPHRASE}, headers={"X-Forwarded-For": unique_ip()}
    )
    assert res.status_code == 200, res.text
    return bearer(res.json()["access_token"])


async def test_one_person_does_everything_and_every_waiver_is_audited(migrated: Settings, seeded: object) -> None:
    await reseed_test_db(migrated)
    try:
        async with app_client(migrated.model_copy(update=NO_LIMITS)) as (http, _app):
            health = (await http.get(f"{API}/health")).json()
            assert "single_user" not in health
            h = await _session_headers(http)
            kill = await http.post(f"{API}/risk/kill-switch", json={"reason": "Bir durum var."}, headers=h)
            assert kill.status_code == 200, kill.text
            start = await http.post(
                f"{API}/risk/kill-switch/reset/request", json={"reason": "Olay incelendi."}, headers=h
            )
            assert start.status_code == 200, start.text
            await _floor_drawdown(migrated)
            await _wait_over(migrated)
            done = await http.post(
                f"{API}/risk/kill-switch/reset/confirm", json={"reason": "Olay incelendi, devam."}, headers=h
            )
            assert done.status_code == 200, done.text
            assert done.json()["kill_switch"] == "off"
            prop = await http.post(
                f"{API}/limits/proposals",
                json={"key": "max_group_pct", "value": 0.15, "reason": "Grup tavanını sıkılaştırıyorum."},
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
            assert decided.json()["active"]["proposed_by"]["uid"] == decided.json()["active"]["decided_by"]["uid"]
            verified = await http.post(f"{API}/audit/verify", headers=h)
            assert verified.status_code == 200 and verified.json()["ok"] is True
        waivers = await _rows(
            migrated,
            "SELECT actor, payload FROM audit.audit_log WHERE action = %s ORDER BY chain_pos",
            (WAIVER_ACTION,),
        )
        assert [w["payload"]["flow"] for w in waivers] == ["kill_reset", "limits"]
        assert all(w["actor"] == "user:sahip" and w["payload"]["waiver"] == "single_user_waiver" for w in waivers)
        assert all(w["payload"]["first_uid"] == "sahip" for w in waivers)
    finally:
        await reseed_test_db(migrated)


async def test_with_real_data_the_restart_waits_and_says_until_when(migrated: Settings, seeded: object) -> None:
    await reseed_test_db(migrated)
    real = migrated.model_copy(update={**NO_LIMITS, "kaptan_mode": "paper"})
    try:
        async with app_client(real) as (http, app):
            h = await _session_headers(http)
            assert (await http.post(f"{API}/risk/kill-switch", json={"reason": "Bir durum var."}, headers=h)).is_success
            start = await http.post(
                f"{API}/risk/kill-switch/reset/request", json={"reason": "Olay incelendi."}, headers=h
            )
            assert start.status_code == 200, start.text
            ready_at = start.json()["reset"]["ready_at"]
            clock: Clock = app.state.clock
            assert ready_at is not None and datetime.fromisoformat(ready_at.replace("Z", "+00:00")) > clock.now()
            status = (await http.get(f"{API}/risk/status", headers=h)).json()
            assert status["reset"]["ready_at"] == ready_at
            early = await http.post(
                f"{API}/risk/kill-switch/reset/confirm", json={"reason": "Olay incelendi, devam."}, headers=h
            )
            assert early.status_code == 409, early.text
            body = early.json()
            assert body["code"] == "conflict" and "5 borsa günü" in body["detail"]
            assert (await http.get(f"{API}/risk/status", headers=h)).json()["kill_switch"] == "on"
        refused = await _rows(migrated, "SELECT count(*) AS n FROM audit.audit_log WHERE action = %s", (WAIVER_ACTION,))
        assert refused == [{"n": 0}]  # a refused confirm leaves no waiver behind
    finally:
        await reseed_test_db(migrated)


async def test_the_chain_keeps_verifying_across_old_team_records(migrated: Settings, seeded: object) -> None:
    """A record signed by someone from the team days stays as it is; a waiver is written next to it."""
    await reseed_test_db(migrated)
    conn = await connect(migrated.database_url.get_secret_value())
    try:
        now = datetime.fromisoformat("2027-01-11T10:40:00+00:00")
        await second_signature(
            conn, first_uid="uye-1", uid="sahip", flow="limits", entity_type="limit_version", entity_id="9", now=now
        )
        async with conn.cursor() as cur:
            await cur.execute("SELECT payload FROM audit.audit_log WHERE action = %s", (WAIVER_ACTION,))
            row = await cur.fetchone()
        assert row is not None and row["payload"]["first_uid"] == "uye-1"
        assert (await verify_db(conn, iso_ms(now)))["ok"] is True
    finally:
        await conn.rollback()
        await conn.close()
        await reseed_test_db(migrated)
