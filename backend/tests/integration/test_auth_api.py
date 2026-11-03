"""/auth/login, /auth/refresh, /auth/logout, /me (API.md §2) against the real app + Postgres."""

from __future__ import annotations

import httpx
import pytest

from kaptan.auth.tokens import create_access_token
from kaptan.db import connect
from kaptan.settings import Settings
from tests.conftest import DEMO_PASSPHRASE, bearer, login, reseed_test_db
from tests.contract.harness import assert_matches

pytestmark = pytest.mark.integration

COOKIE = "__Host-kaptan_rt"
CSRF = {"X-KAPtan-CSRF": "1"}


async def test_login_is_the_one_person_and_sets_the_refresh_cookie(client: httpx.AsyncClient) -> None:
    res = await client.post("/api/v1/auth/login", json={"passphrase": DEMO_PASSPHRASE})
    assert res.status_code == 200
    body = res.json()
    assert body["user"] == {"id": "sahip", "display_name": "Sahip"}
    assert_matches("Me", body["user"])
    cookie = res.headers["set-cookie"]
    for part in (f"{COOKIE}=", "HttpOnly", "Secure", "SameSite=strict", "Path=/"):
        assert part.lower() in cookie.lower(), cookie
    assert "domain=" not in cookie.lower()
    me = await client.get("/api/v1/me", headers=bearer(body["access_token"]))
    assert me.status_code == 200
    assert me.json() == body["user"]


async def test_an_old_clients_role_field_is_ignored(client: httpx.AsyncClient) -> None:
    res = await client.post("/api/v1/auth/login", json={"passphrase": DEMO_PASSPHRASE, "role": "auditor"})
    assert res.status_code == 200
    assert res.json()["user"] == {"id": "sahip", "display_name": "Sahip"}


async def test_login_refusals(client: httpx.AsyncClient, migrated: Settings) -> None:
    wrong = await client.post("/api/v1/auth/login", json={"passphrase": "yanlış"})
    assert wrong.status_code == 401
    assert wrong.json()["code"] == "unauthenticated"
    missing = await client.post("/api/v1/auth/login", json={})
    assert missing.status_code == 422
    assert missing.json() == {"detail": "Eksik alan: passphrase.", "code": "validation"}
    conn = await connect(migrated.database_url.get_secret_value())
    try:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT actor, payload FROM audit.audit_log WHERE action = 'auth.login_failed' ORDER BY chain_pos"
            )
            rows = await cur.fetchall()
        await conn.rollback()
    finally:
        await conn.close()
    assert len(rows) == 1  # 09 §7.1: audited, without the passphrase or the raw IP
    assert rows[0]["actor"] == "system:auth"
    assert set(rows[0]["payload"]) == {"client"}
    assert "yanlış" not in str(rows[0]["payload"])
    await reseed_test_db(migrated)


async def test_login_is_rate_limited(client: httpx.AsyncClient, migrated: Settings) -> None:
    codes = [(await client.post("/api/v1/auth/login", json={"passphrase": "x"})).status_code for _ in range(6)]
    assert codes[:5] == [401] * 5
    assert codes[5] == 429
    await reseed_test_db(migrated)


async def test_me_without_or_with_a_bad_token_is_401_envelope(client: httpx.AsyncClient) -> None:
    res = await client.get("/api/v1/me")
    assert res.status_code == 401
    assert res.json() == {"detail": "Oturum bulunamadı. Yeniden giriş yap.", "code": "unauthenticated"}
    bad = await client.get("/api/v1/me", headers=bearer("abc.def.ghi"))
    assert bad.status_code == 401
    assert bad.json()["code"] == "unauthenticated"


async def test_refresh_keeps_the_one_person(client: httpx.AsyncClient) -> None:
    await login(client)
    refreshed = await client.post("/api/v1/auth/refresh", headers=CSRF)
    assert refreshed.status_code == 200, refreshed.text
    assert set(refreshed.json()) == {"access_token"}
    me = await client.get("/api/v1/me", headers=bearer(refreshed.json()["access_token"]))
    assert me.json() == {"id": "sahip", "display_name": "Sahip"}


async def test_the_role_and_team_endpoints_are_gone(client: httpx.AsyncClient) -> None:
    h = bearer((await login(client))["access_token"])
    assert (await client.post("/api/v1/auth/role", json={"role": "admin"}, headers=h)).status_code == 404
    assert (await client.get("/api/v1/admin/users", headers=h)).status_code == 404


async def test_a_token_from_the_team_days_is_turned_away(client: httpx.AsyncClient, migrated: Settings) -> None:
    old = create_access_token(migrated, uid="uye-3", name="Üye 3", family="f")
    res = await client.get("/api/v1/me", headers=bearer(old))
    assert (res.status_code, res.json()["code"]) == (401, "unauthenticated")


async def test_refresh_needs_the_csrf_header_and_an_allowed_origin(client: httpx.AsyncClient) -> None:
    await login(client)
    no_header = await client.post("/api/v1/auth/refresh")
    assert no_header.status_code == 403
    assert no_header.json()["code"] == "csrf"
    evil = await client.post("/api/v1/auth/refresh", headers={**CSRF, "Origin": "https://evil.example"})
    assert evil.status_code == 403
    ok = await client.post("/api/v1/auth/refresh", headers={**CSRF, "Origin": "http://localhost:3100"})
    assert ok.status_code == 200


async def test_refresh_rotates_and_a_reused_token_revokes_the_family(client: httpx.AsyncClient) -> None:
    await login(client)
    first = client.cookies.get(COOKIE)
    assert first
    r1 = await client.post("/api/v1/auth/refresh", headers=CSRF)
    assert r1.status_code == 200
    second = client.cookies.get(COOKIE)
    assert second and second != first
    # Replay the old (used) token: stolen-token detection revokes the whole family.
    client.cookies.clear()
    replay = await client.post("/api/v1/auth/refresh", headers={**CSRF, "Cookie": f"{COOKIE}={first}"})
    assert replay.status_code == 401
    after = await client.post("/api/v1/auth/refresh", headers={**CSRF, "Cookie": f"{COOKIE}={second}"})
    assert after.status_code == 401


async def test_refresh_without_cookie_and_logout(client: httpx.AsyncClient) -> None:
    none = await client.post("/api/v1/auth/refresh", headers=CSRF)
    assert none.status_code == 401
    unknown = await client.post("/api/v1/auth/refresh", headers={**CSRF, "Cookie": f"{COOKIE}=nope"})
    assert unknown.status_code == 401
    await login(client)
    out = await client.post("/api/v1/auth/logout")
    assert out.status_code == 204
    assert client.cookies.get(COOKIE) is None
    again = await client.post("/api/v1/auth/logout")
    assert again.status_code == 204
