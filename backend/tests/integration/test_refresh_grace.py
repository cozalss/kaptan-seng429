"""REFRESH_GRACE_S: two tabs refreshing at once keep the session; a late reuse is still theft (09 §6)."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from kaptan.api.routers import auth as auth_router
from kaptan.settings import Settings
from tests.conftest import DEMO_PASSPHRASE, bearer
from tests.integration.ops_support import app_client, unique_ip

pytestmark = pytest.mark.integration

COOKIE = "__Host-kaptan_rt"
CSRF = {"X-KAPtan-CSRF": "1"}


def graced(base: Settings) -> Settings:
    return base.model_copy(update={"refresh_grace_s": 10, "trusted_proxies": ["127.0.0.1/32"]})


async def _login(http: httpx.AsyncClient, role: str = "risk_officer") -> str:
    res = await http.post(
        "/api/v1/auth/login",
        json={"passphrase": DEMO_PASSPHRASE, "role": role},
        headers={"X-Forwarded-For": unique_ip()},
    )
    assert res.status_code == 200, res.text
    token = http.cookies.get(COOKIE)
    assert token
    return token


async def _refresh(http: httpx.AsyncClient, token: str) -> httpx.Response:
    return await http.post("/api/v1/auth/refresh", headers={**CSRF, "Cookie": f"{COOKIE}={token}"})


async def test_two_tabs_refreshing_at_once_both_stay_signed_in(migrated: Settings, seeded: object) -> None:
    async with app_client(graced(migrated)) as (http, _):
        first = await _login(http)
        http.cookies.clear()
        a, b = await asyncio.gather(_refresh(http, first), _refresh(http, first))
        assert (a.status_code, b.status_code) == (200, 200)
        tokens = {r.cookies.get(COOKIE) for r in (a, b)}
        assert None not in tokens and len(tokens) == 2  # each tab got its own successor
        for successor in tokens:
            assert successor is not None
            again = await _refresh(http, successor)
            assert again.status_code == 200, again.text
            me = await http.get("/api/v1/me", headers=bearer(again.json()["access_token"]))
            assert me.json()["role"] == "risk_officer"


async def test_a_reuse_after_the_grace_window_revokes_the_family(
    migrated: Settings, seeded: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    async with app_client(graced(migrated)) as (http, _):
        first = await _login(http)
        http.cookies.clear()
        r1 = await _refresh(http, first)
        assert r1.status_code == 200
        second = r1.cookies.get(COOKIE)
        assert second
        later = datetime.now(UTC) + timedelta(seconds=11)
        monkeypatch.setattr(auth_router, "_wall_now", lambda: later)
        replay = await _refresh(http, first)
        assert replay.status_code == 401
        assert (await _refresh(http, second)).status_code == 401  # the whole family is gone


async def test_the_grace_sibling_keeps_a_role_switched_after_the_rotation(migrated: Settings, seeded: object) -> None:
    async with app_client(graced(migrated)) as (http, _):
        first = await _login(http)
        http.cookies.clear()
        r1 = await _refresh(http, first)
        switched = await http.post(
            "/api/v1/auth/role", json={"role": "admin"}, headers=bearer(r1.json()["access_token"])
        )
        assert switched.status_code == 200
        sibling = await _refresh(http, first)
        assert sibling.status_code == 200
        me = await http.get("/api/v1/me", headers=bearer(sibling.json()["access_token"]))
        assert me.json() == {"id": "uye-1", "display_name": "Üye 1", "role": "admin"}


async def test_without_a_grace_window_an_immediate_reuse_is_theft(migrated: Settings, seeded: object) -> None:
    async with app_client(migrated.model_copy(update={"trusted_proxies": ["127.0.0.1/32"]})) as (http, _):
        first = await _login(http)
        http.cookies.clear()
        assert (await _refresh(http, first)).status_code == 200
        assert (await _refresh(http, first)).status_code == 401
