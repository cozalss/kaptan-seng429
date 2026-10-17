"""Package B: GET /limits and the two-signature limit change."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from kaptan.api.main import API_PREFIX
from kaptan.db import connect
from kaptan.demo.fixtures import FIXTURE_DIR
from kaptan.settings import Settings
from tests.conftest import bearer, login, reseed_test_db
from tests.contract.harness import assert_matches

pytestmark = pytest.mark.integration

REASON = "Oynaklık arttı, işlem başına riski azaltalım."


async def _token(client: httpx.AsyncClient, role: str) -> str:
    session = await login(client, role)  # type: ignore[arg-type]
    token: str = session["access_token"]
    return token


async def _propose(client: httpx.AsyncClient, token: str, **body: Any) -> httpx.Response:
    return await client.post(f"{API_PREFIX}/limits/proposals", json=body, headers=bearer(token))


async def _decide(client: httpx.AsyncClient, token: str, version: int, **body: Any) -> httpx.Response:
    return await client.post(f"{API_PREFIX}/limits/proposals/{version}/decision", json=body, headers=bearer(token))


async def _last_audit(settings: Settings) -> dict[str, Any]:
    conn = await connect(settings.database_url.get_secret_value())
    try:
        async with conn.cursor() as cur:
            await cur.execute("SELECT action, entity_id, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1")
            row = await cur.fetchone()
    finally:
        await conn.close()
    assert row is not None
    return dict(row)


async def test_limits_view_matches_the_mock(client: httpx.AsyncClient) -> None:
    res = await client.get(f"{API_PREFIX}/limits", headers=bearer(await _token(client, "analyst")))
    assert res.status_code == 200
    assert_matches("LimitsView", res.json())
    expected = json.loads((FIXTURE_DIR / "expected" / "limits_view.json").read_text(encoding="utf-8"))
    assert res.json() == expected


async def test_propose_then_approve_then_reject(client: httpx.AsyncClient, migrated: Settings) -> None:
    admin, risk = await _token(client, "admin"), await _token(client, "risk_officer")
    try:
        same = await _propose(client, admin, key="risk_per_trade_pct", value=0.005, reason=REASON)
        assert same.status_code == 422 and same.json() == {"detail": "Yeni değer şimdikiyle aynı.", "code": "no_change"}
        looser = await _propose(client, admin, key="max_position_pct", value=0.2, reason=REASON)
        assert looser.status_code == 422 and looser.json() == {
            "detail": "Pozisyon tavanı: kanonik sınırdan gevşek olamaz (R07).",
            "code": "looser",
        }
        short = await _propose(client, admin, key="max_position_pct", value=0.05, reason="kısa")
        assert short.status_code == 422 and short.json()["code"] == "validation"

        ok = await _propose(client, admin, key="risk_per_trade_pct", value=0.004, reason=REASON)
        assert ok.status_code == 200, ok.text
        view = ok.json()
        assert_matches("LimitsView", view)
        pending = view["pending"]
        assert (pending["version"], pending["status"], pending["proposed_by"]["role"]) == (2, "proposed", "admin")
        assert {v["key"]: v["value"] for v in pending["values"]}["risk_per_trade_pct"] == 0.004
        assert [v["key"] for v in pending["values"]] == [v["key"] for v in view["active"]["values"]]
        assert [h["version"] for h in view["history"]] == [1]
        audit = await _last_audit(migrated)
        assert (audit["action"], audit["entity_id"], audit["payload"]) == (
            "limits.proposed",
            "2",
            {"key": "risk_per_trade_pct", "from": 0.005, "to": 0.004, "role": "admin"},
        )
        dup = await _propose(client, admin, key="max_position_pct", value=0.05, reason=REASON)
        assert dup.status_code == 409 and dup.json() == {
            "detail": "İkinci imzayı bekleyen bir değişiklik zaten var.",
            "code": "pending_exists",
        }

        approved = await _decide(client, risk, 2, decision="approve")
        assert approved.status_code == 200
        v = approved.json()
        assert_matches("LimitsView", v)
        assert (v["active"]["version"], v["pending"], v["active"]["decided_by"]["uid"]) == (2, None, "uye-3")
        assert v["active"]["effective_from"].startswith("2027-01-11T10:4")
        assert [(h["version"], h["status"]) for h in v["history"]] == [(2, "active"), (1, "superseded")]
        audit = await _last_audit(migrated)
        assert (audit["action"], audit["payload"]) == (
            "limits.approved",
            {"proposed_by": "uye-1", "role": "risk_officer"},
        )
        gone = await _decide(client, risk, 2, decision="approve")
        assert gone.status_code == 409 and gone.json() == {
            "detail": "Bu değişiklik artık imza beklemiyor.",
            "code": "conflict",
        }
        assert (await _decide(client, risk, 99, decision="reject")).status_code == 409

        await _propose(client, admin, key="max_concurrent_positions", value=8, reason=REASON)
        rejected = await _decide(client, risk, 3, decision="reject", comment=" Şimdilik gerek yok. ")
        r = rejected.json()
        assert (r["active"]["version"], r["pending"]) == (2, None)
        assert [(h["version"], h["status"]) for h in r["history"]] == [
            (3, "rejected"),
            (2, "active"),
            (1, "superseded"),
        ]
        assert r["history"][0]["decided_by"]["reason"] == "Şimdilik gerek yok."
        assert r["history"][0]["effective_from"] is None
        assert (await _last_audit(migrated))["action"] == "limits.rejected"

        # same person: a version proposed by the Risk Sorumlusu's own uid (seeded directly)
        await _propose(client, admin, key="max_group_pct", value=0.15, reason=REASON)
        conn = await connect(migrated.database_url.get_secret_value())
        try:
            await conn.execute(
                "UPDATE trading.limit_versions SET proposed_by = jsonb_set(proposed_by, '{uid}', '\"uye-3\"') "
                "WHERE version = 4"
            )
            await conn.commit()
        finally:
            await conn.close()
        self_sign = await _decide(client, risk, 4, decision="approve")
        assert self_sign.status_code == 403 and self_sign.json() == {
            "detail": "Öneren kişi onaylayamaz; ikinci imza başka birinden gelir.",
            "code": "same_person",
        }
    finally:
        await reseed_test_db(migrated)
