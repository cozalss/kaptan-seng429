"""One person runs KAPtan: signed in = allowed, and every waived second signature is on record as
`auth.single_user_waiver`."""

from __future__ import annotations

from typing import Any

import pytest

from kaptan.auth.four_eyes import WAIVER_ACTION
from kaptan.db import connect
from kaptan.settings import Settings
from tests.conftest import DEMO_PASSPHRASE, bearer, reseed_test_db
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
        assert [w["payload"]["flow"] for w in waivers] == ["limits"]
        assert all(w["actor"] == "user:sahip" and w["payload"]["waiver"] == "single_user_waiver" for w in waivers)
        assert all(w["payload"]["first_uid"] == "sahip" for w in waivers)
    finally:
        await reseed_test_db(migrated)
