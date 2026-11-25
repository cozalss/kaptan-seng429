"""Change password, sign out everywhere, Tatil modu, alert preferences and the backup box (agent COMFORT)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest

from kaptan.db import connect
from kaptan.settings import Settings
from tests.conftest import DEMO_PASSPHRASE, bearer, login, reseed_test_db
from tests.contract.harness import assert_matches

pytestmark = pytest.mark.integration

API = "/api/v1"
NEW = "yeni-parolam-1"


async def _sql(settings: Settings, query: str) -> list[dict[str, Any]]:
    assert settings.database_owner_url is not None
    conn = await connect(settings.database_owner_url.get_secret_value())
    try:
        async with conn.cursor() as cur:
            await cur.execute(query)  # type: ignore[call-overload]
            rows = await cur.fetchall() if cur.description else []
        await conn.commit()
        return [dict(r) for r in rows]
    finally:
        await conn.close()


RESET = (
    "UPDATE auth.credentials SET passphrase_hash = NULL, changed_at = NULL",
    "UPDATE ops.preferences SET pause_until = NULL, pause_since = NULL, alerts = NULL",
    "UPDATE ops.backup_request SET requested_at = NULL, started_at = NULL, finished_at = NULL, ok = NULL",
    "DELETE FROM ops.job_runs WHERE trigger = 'manual'",
    "UPDATE ops.telegram SET level = 'normal', daily_cap = 8, chat_id = NULL",
)


#: Other test files keep one cached login for the whole session (a_support.token): these tests sign sessions out, so
#: they close every earlier session first (an exact count) and open them again afterwards.
SIGN_ALL_OUT = "UPDATE auth.refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL"
SIGN_ALL_BACK_IN = "UPDATE auth.refresh_tokens SET revoked_at = NULL"


@pytest.fixture
async def clean(client: httpx.AsyncClient, migrated: Settings) -> AsyncIterator[httpx.AsyncClient]:
    await reseed_test_db(migrated)
    for statement in (*RESET, SIGN_ALL_OUT):
        await _sql(migrated, statement)
    yield client
    for statement in (*RESET, SIGN_ALL_BACK_IN):
        await _sql(migrated, statement)
    await reseed_test_db(migrated)


async def _audit_actions(settings: Settings) -> list[str]:
    rows = await _sql(settings, "SELECT action FROM audit.audit_log ORDER BY chain_pos")
    return [str(r["action"]) for r in rows]


async def test_changing_the_password_signs_the_others_out_and_the_new_one_works(
    clean: httpx.AsyncClient, migrated: Settings
) -> None:
    here = (await login(clean))["access_token"]
    other = (await login(clean))["access_token"]
    res = await clean.post(f"{API}/auth/password", json={"current": DEMO_PASSPHRASE, "new": NEW}, headers=bearer(here))
    assert res.status_code == 200, res.text
    assert res.json() == {"signed_out_others": 1}
    assert_matches("PasswordChanged", res.json())
    assert (await clean.get(f"{API}/me", headers=bearer(here))).status_code == 200  # this device stays in
    assert (await clean.get(f"{API}/me", headers=bearer(other))).status_code == 401  # not in 15 minutes: now
    assert (await clean.post(f"{API}/auth/login", json={"passphrase": DEMO_PASSPHRASE})).status_code == 401
    assert (await clean.post(f"{API}/auth/login", json={"passphrase": NEW})).status_code == 200
    rows = await _sql(migrated, "SELECT passphrase_hash FROM auth.credentials")
    assert str(rows[0]["passphrase_hash"]).startswith("$argon2") and NEW not in str(rows[0])
    assert "auth.password_changed" in await _audit_actions(migrated)
    payloads = await _sql(migrated, "SELECT payload FROM audit.audit_log WHERE action = 'auth.password_changed'")
    assert NEW not in str(payloads) and DEMO_PASSPHRASE not in str(payloads)


async def test_a_wrong_current_or_weak_new_password_changes_nothing(
    clean: httpx.AsyncClient, migrated: Settings
) -> None:
    token = (await login(clean))["access_token"]
    wrong = await clean.post(f"{API}/auth/password", json={"current": "yanlış", "new": NEW}, headers=bearer(token))
    assert (wrong.status_code, wrong.json()["code"]) == (403, "wrong_password")
    for new in ("kısa", DEMO_PASSPHRASE, "x" * 201, "x" * 2001):
        res = await clean.post(
            f"{API}/auth/password", json={"current": DEMO_PASSPHRASE, "new": new}, headers=bearer(token)
        )
        assert res.status_code == 422, res.text
    assert (await _sql(migrated, "SELECT passphrase_hash FROM auth.credentials"))[0]["passphrase_hash"] is None
    assert "auth.password_change_failed" in await _audit_actions(migrated)
    needs_login = await clean.post(f"{API}/auth/password", json={"current": DEMO_PASSPHRASE, "new": NEW})
    assert needs_login.status_code == 401


async def test_password_change_is_rate_limited(clean: httpx.AsyncClient) -> None:
    token = (await login(clean))["access_token"]
    codes = [
        (
            await clean.post(f"{API}/auth/password", json={"current": "yanlış", "new": NEW}, headers=bearer(token))
        ).status_code
        for _ in range(6)
    ]
    assert codes[:5] == [403] * 5 and codes[5] == 429


async def test_sign_out_everywhere_ends_every_session_including_this_one(
    clean: httpx.AsyncClient, migrated: Settings
) -> None:
    a = (await login(clean))["access_token"]
    b = (await login(clean))["access_token"]
    assert (await clean.post(f"{API}/auth/logout-all", headers=bearer(a))).status_code == 204
    for token in (a, b):
        assert (await clean.get(f"{API}/me", headers=bearer(token))).status_code == 401
    assert "auth.signed_out_everywhere" in await _audit_actions(migrated)


async def test_pause_by_days_by_date_and_resume(clean: httpx.AsyncClient, migrated: Settings) -> None:
    h = bearer((await login(clean))["access_token"])
    start = await clean.get(f"{API}/me/preferences", headers=h)
    assert_matches("Preferences", start.json())
    assert start.json()["pause"] == {"active": False, "until": None, "since": None}
    res = await clean.post(f"{API}/me/pause", json={"days": 3}, headers=h)
    assert res.status_code == 200, res.text
    pause = res.json()["pause"]
    assert pause["active"] and pause["until"] and pause["since"]
    assert_matches("Preferences", res.json())
    assert (await clean.post(f"{API}/me/pause", json={"days": 91}, headers=h)).status_code == 422
    assert (await clean.post(f"{API}/me/pause", json={"days": 2, "until": "2999-01-01"}, headers=h)).status_code == 422
    past = await clean.post(f"{API}/me/pause", json={"until": "2000-01-01"}, headers=h)
    assert (past.status_code, past.json()["code"]) == (422, "validation")
    assert (await clean.post(f"{API}/me/pause/resume", headers=h)).json()["pause"]["active"] is False
    assert (await clean.post(f"{API}/me/pause/resume", headers=h)).status_code == 200  # nothing running: no record
    actions = await _audit_actions(migrated)
    assert actions.count("preferences.paused") == 1 and actions.count("preferences.resumed") == 1


async def test_alert_preferences_round_trip(clean: httpx.AsyncClient, migrated: Settings) -> None:
    h = bearer((await login(clean))["access_token"])
    prefs = (await clean.get(f"{API}/me/preferences", headers=h)).json()["alerts"]
    assert prefs["quiet"]["on"] is False and prefs["kinds"]["watched"] == {"phone": True, "desktop": True}
    changed = {**prefs, "quiet": {"on": True, "start": "23:00", "end": "07:30"}}
    changed["kinds"] = {**prefs["kinds"], "part_down": {"phone": False, "desktop": True}}
    res = await clean.put(f"{API}/me/alerts/preferences", json=changed, headers=h)
    assert res.status_code == 200, res.text
    assert res.json()["alerts"] == changed
    assert (await clean.get(f"{API}/me/preferences", headers=h)).json()["alerts"] == changed
    broken = {**changed, "quiet": {"on": True, "start": "25:00", "end": "07:30"}}
    assert (await clean.put(f"{API}/me/alerts/preferences", json=broken, headers=h)).status_code == 422
    assert "preferences.alerts_changed" in await _audit_actions(migrated)


async def test_settings_reset_puts_the_settings_back_and_touches_nothing_else(
    clean: httpx.AsyncClient, migrated: Settings
) -> None:
    h = bearer((await login(clean))["access_token"])
    prefs = (await clean.get(f"{API}/me/preferences", headers=h)).json()["alerts"]
    changed = {**prefs, "quiet": {"on": True, "start": "23:00", "end": "07:30"}, "muted": ["THYAO"]}
    changed["kinds"] = {**prefs["kinds"], "part_down": {"phone": False, "desktop": False}}
    assert (await clean.put(f"{API}/me/alerts/preferences", json=changed, headers=h)).status_code == 200
    assert (await clean.post(f"{API}/me/pause", json={"days": 3}, headers=h)).status_code == 200
    assert (
        await clean.put(f"{API}/me/telegram", json={"level": "more", "daily_cap": 20}, headers=h)
    ).status_code == 200
    await _sql(migrated, "UPDATE ops.telegram SET chat_id = 4242")  # a paired phone
    limits_before = await _sql(migrated, "SELECT count(*) AS n FROM audit.audit_log WHERE action LIKE 'limits.%'")

    res = await clean.post(f"{API}/me/settings/reset", headers=h)
    assert res.status_code == 200, res.text
    body = res.json()
    assert_matches("SettingsReset", body)
    assert body["preferences"]["alerts"] == (await clean.get(f"{API}/me/preferences", headers=h)).json()["alerts"]
    assert body["preferences"]["alerts"]["quiet"]["on"] is False and body["preferences"]["alerts"]["muted"] == []
    assert body["preferences"]["alerts"]["kinds"]["part_down"] == {"phone": True, "desktop": True}
    assert body["preferences"]["pause"]["active"] is False
    assert (body["telegram"]["level"], body["telegram"]["daily_cap"], body["telegram"]["paired"]) == ("normal", 8, True)
    stored = await _sql(migrated, "SELECT alerts, chat_id FROM ops.preferences, ops.telegram")
    assert stored[0]["alerts"] is None and stored[0]["chat_id"] == 4242  # still paired
    assert (
        await _sql(migrated, "SELECT count(*) AS n FROM audit.audit_log WHERE action LIKE 'limits.%'") == limits_before
    )
    assert (await _audit_actions(migrated)).count("settings.reset") == 1
    again = await clean.post(f"{API}/me/settings/reset", headers=h)  # already default: still fine, one more record
    assert again.status_code == 200
    assert (await _audit_actions(migrated)).count("settings.reset") == 2


async def test_backup_box_asks_once_and_shows_the_result(clean: httpx.AsyncClient, migrated: Settings) -> None:
    h = bearer((await login(clean))["access_token"])
    first = (await clean.get(f"{API}/me/backup", headers=h)).json()
    assert_matches("BackupStatus", first)
    assert first["state"] == "idle"
    ask = await clean.post(f"{API}/me/backup/run", headers=h)
    assert ask.status_code == 200 and ask.json()["state"] == "waiting" and ask.json()["requested_at"]
    assert (await clean.post(f"{API}/me/backup/run", headers=h)).json()["state"] == "waiting"  # no second request
    assert (await _audit_actions(migrated)).count("backup.requested") == 1
    await _sql(
        migrated, "UPDATE ops.backup_request SET started_at = requested_at"
    )  # the loop picks it up (the app clock is the fixture day)
    assert (await clean.get(f"{API}/me/backup", headers=h)).json()["state"] == "running"
    await _sql(
        migrated,
        "INSERT INTO ops.job_runs (job, slot, trigger, started_at, finished_at, ok) "
        "VALUES ('backup', '2026-11-21', 'manual', now(), now(), true)",
    )
    await _sql(migrated, "UPDATE ops.backup_request SET finished_at = requested_at, ok = true")
    done = (await clean.get(f"{API}/me/backup", headers=h)).json()
    assert done["state"] == "idle" and done["last_ok"] is True and done["last_at"]


async def test_everything_needs_a_session(clean: httpx.AsyncClient) -> None:
    calls = (
        ("GET", "/me/preferences"),
        ("POST", "/me/pause"),
        ("POST", "/me/settings/reset"),
        ("GET", "/me/backup"),
        ("POST", "/me/backup/run"),
        ("POST", "/auth/logout-all"),
    )
    for method, path in calls:
        assert (await clean.request(method, f"{API}{path}")).status_code == 401
