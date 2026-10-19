"""Admin management endpoints (M3 B3, FR-34): R13 team blocklist, universe overrides, config view."""

from __future__ import annotations

from datetime import date

import httpx
import pytest

from kaptan.reference.universe import universe_on
from kaptan.settings import Settings
from tests.contract.harness import assert_matches
from tests.integration.a_support import api, call, fresh, sql

pytestmark = pytest.mark.integration
__all__ = ["api", "fresh"]

REASON = {"reason": "Yakın bir tanıdığım bu şirkette çalışıyor."}
DAY = date(2027, 1, 11)


async def _actions(settings: Settings, prefix: str) -> list[str]:
    rows = await sql(settings, "SELECT action FROM audit.audit_log WHERE action LIKE %s ORDER BY chain_pos", (prefix,))
    return [r["action"] for r in rows]


async def test_restricted_list_matches_the_panel_schema(api: httpx.AsyncClient) -> None:
    res = await call(api, "auditor", "GET", "/admin/restricted")
    assert res.status_code == 200, res.text
    body = res.json()
    assert_matches("RestrictedSecurity", body["entries"], many=True)
    assert body["pending_removals"] == []
    assert (await call(api, "analyst", "GET", "/admin/restricted")).status_code == 403


async def test_add_then_two_signature_removal(api: httpx.AsyncClient, migrated: Settings) -> None:
    body = {"ticker": "ASELS", "kind": "team_insider", **REASON}
    assert (await call(api, "risk_officer", "POST", "/admin/restricted", body)).status_code == 403
    added = await call(api, "admin", "POST", "/admin/restricted", body)
    assert added.status_code == 200, added.text
    entry = next(e for e in added.json()["entries"] if e["ticker"] == "ASELS")
    assert entry["id"].startswith("tb:") and entry["added_by"].startswith("user:")
    assert (await call(api, "admin", "POST", "/admin/restricted", body)).json()["code"] == "already_listed"

    path = f"/admin/restricted/{entry['id']}/removal"
    early = await call(api, "risk_officer", "POST", f"{path}/confirm", REASON)
    assert (early.status_code, early.json()["code"]) == (409, "not_started")
    req = await call(api, "admin", "POST", path, REASON)
    assert req.status_code == 200 and req.json()["pending_removals"][0]["id"] == entry["id"]
    assert (await call(api, "admin", "POST", path, REASON)).json()["code"] == "pending_exists"
    assert (await call(api, "admin", "POST", f"{path}/confirm", REASON)).status_code == 403
    done = await call(api, "risk_officer", "POST", f"{path}/confirm", REASON)
    assert done.status_code == 200, done.text
    assert all(e["id"] != entry["id"] for e in done.json()["entries"])
    assert await _actions(migrated, "restricted.%") == [
        "restricted.added",
        "restricted.removal_requested",
        "restricted.removed",
    ]


async def test_synced_rows_cannot_be_removed_by_hand(api: httpx.AsyncClient) -> None:
    res = await call(api, "admin", "POST", "/admin/restricted/rs-1/removal", REASON)
    assert (res.status_code, res.json()["code"]) == (409, "synced")
    missing = await call(api, "admin", "POST", "/admin/restricted/tb:nope/removal", REASON)
    assert missing.status_code == 404
    seeded_team = await call(api, "admin", "POST", "/admin/restricted/rs-2/removal", REASON)
    assert seeded_team.status_code == 200, seeded_team.text


async def test_universe_overrides(api: httpx.AsyncClient, migrated: Settings) -> None:
    # universe_daily and the overrides survive the demo reseed: start clean, end clean.
    await sql(migrated, "DELETE FROM core.universe_daily WHERE d = %s", (DAY,))
    await sql(migrated, "DELETE FROM core.universe_overrides")
    empty = await call(api, "admin", "GET", "/admin/universe?d=2020-01-02")
    assert empty.status_code == 200 and empty.json()["rows"] == [] and empty.json()["d"] is None
    for ticker, ok in (("KRGCL", True), ("ASELS", False)):
        await sql(
            migrated,
            "INSERT INTO core.universe_daily (d, ticker, is_eligible, reasons, rule_version, adv20_try, free_float_pct)"
            " VALUES (%s, %s, %s, %s, 'u-v1', 1000000, 0.4)",
            (DAY, ticker, ok, [] if ok else ["U3"]),
        )
    view = await call(api, "auditor", "GET", "/admin/universe?d=2027-01-11")
    rows = {r["ticker"]: r for r in view.json()["rows"]}
    assert rows["KRGCL"]["in_universe"] and not rows["ASELS"]["in_universe"]
    assert rows["ASELS"]["reasons"] == ["U3"]

    put = {"mode": "include", "reason": "Likidite geçici düştü, izlemeye devam."}
    assert (await call(api, "auditor", "PUT", "/admin/universe/overrides/ASELS", put)).status_code == 403
    assert (await call(api, "admin", "PUT", "/admin/universe/overrides/ASELS", put)).status_code == 200
    excl = {"mode": "exclude", "reason": "Ekipte bu şirketle bağlantı var."}
    assert (await call(api, "admin", "PUT", "/admin/universe/overrides/KRGCL", excl)).status_code == 200
    view = await call(api, "admin", "GET", "/admin/universe?d=2027-01-11")
    rows = {r["ticker"]: r for r in view.json()["rows"]}
    assert rows["ASELS"]["in_universe"] and rows["ASELS"]["override"]["mode"] == "include"
    assert not rows["KRGCL"]["in_universe"] and rows["KRGCL"]["is_eligible"]

    from kaptan.db import connect

    conn = await connect(migrated.database_url.get_secret_value())
    try:
        assert await universe_on(conn, DAY) == ["ASELS"]
    finally:
        await conn.close()
    cleared = await call(
        api, "admin", "DELETE", "/admin/universe/overrides/KRGCL?reason=Bağlantı%20sona%20erdi%20artık."
    )
    assert cleared.status_code == 200, cleared.text
    again = await call(api, "admin", "DELETE", "/admin/universe/overrides/KRGCL?reason=Bağlantı%20sona%20erdi%20artık.")
    assert again.status_code == 404
    await sql(migrated, "DELETE FROM core.universe_daily WHERE d = %s", (DAY,))
    await sql(migrated, "DELETE FROM core.universe_overrides")
    assert await _actions(migrated, "universe.%") == [
        "universe.override_set",
        "universe.override_set",
        "universe.override_cleared",
    ]


async def test_config_view_has_no_secrets(api: httpx.AsyncClient) -> None:
    res = await call(api, "auditor", "GET", "/admin/config")
    assert res.status_code == 200, res.text
    body = res.json()
    assert_matches("ConfigView", body["view"])
    names = set(body["settings"])
    assert "database_url" not in names and "jwt_secret" not in names and "groq_api_key" not in names
    assert not any("url" in n or "key" in n or "secret" in n for n in names)
    assert body["limits"]["values"] and body["view"]["fallback_chain"][0]["provider"] == "gemini"
    assert (await call(api, "risk_officer", "GET", "/admin/config")).status_code == 403
