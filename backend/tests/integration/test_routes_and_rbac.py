"""Every API.md endpoint is registered; signed in = allowed (nothing answers 403 for who you are)."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from kaptan.api.main import API_PREFIX, create_app
from kaptan.settings import Settings
from tests.conftest import bearer, login, reseed_test_db

pytestmark = pytest.mark.integration

#: (method, path, body) for the endpoints of API.md §3 (+ /stream).
ENDPOINTS: list[tuple[str, str, dict[str, Any] | None]] = [
    ("GET", "/disclosures/counters", None),
    ("GET", "/approvals?status=all", None),
    (
        "POST",
        "/approvals/prop-day-e1-krgcl/decision",
        {"decision": "approve", "approved_notional_try": None, "comment": ""},
    ),
    ("GET", "/approvals/prop-day-e1-krgcl/notes", None),
    ("POST", "/approvals/prop-day-e1-krgcl/notes", {"body": "Bir not."}),
    ("GET", "/runs/run-day-e1-krgcl/explain", None),
    ("GET", "/tickets", None),
    ("POST", "/tickets/T-2027-0111-020/mark", {"mark": "unfilled"}),
    ("GET", "/portfolio/positions", None),
    ("GET", "/portfolio/pnl?from=2026-12-01&to=2027-01-08", None),
    ("GET", "/risk/status", None),
    ("POST", "/risk/kill-switch", {"reason": "Test durdurma"}),
    ("POST", "/risk/kill-switch/reset/request", {"reason": "Olay incelendi, tamam."}),
    ("POST", "/risk/kill-switch/reset/confirm", {"reason": "Olay incelendi, tamam."}),
    ("GET", "/limits", None),
    (
        "POST",
        "/limits/proposals",
        {"key": "risk_per_trade_pct", "value": 0.004, "reason": "Oynaklık arttı, azaltalım."},
    ),
    ("POST", "/limits/proposals/2/decision", {"decision": "approve"}),
    ("GET", "/audit?scope=all&limit=10", None),
    ("POST", "/audit/verify", None),
    ("POST", "/sse/ticket", None),
]


async def _call(client: httpx.AsyncClient, method: str, path: str, body: Any, token: str) -> httpx.Response:
    return await client.request(method, f"{API_PREFIX}{path}", json=body, headers=bearer(token))


def test_every_contract_route_is_registered() -> None:
    spec = create_app().openapi()
    paths = {(m.upper(), p) for p, ops in spec["paths"].items() for m in ops}
    for method, path, _body in ENDPOINTS:
        template = path.split("?")[0]
        for concrete, param in (
            ("prop-day-e1-krgcl", "{proposal_id}"),
            ("run-day-e1-krgcl", "{run_id}"),
            ("T-2027-0111-020", "{ticket_no}"),
            ("/2/", "/{version}/"),
        ):
            template = template.replace(concrete, param)
        assert (method, API_PREFIX + template) in paths, (method, template)
    for extra in ("/auth/login", "/auth/refresh", "/auth/logout"):
        assert ("POST", API_PREFIX + extra) in paths
    assert ("POST", API_PREFIX + "/auth/role") not in paths
    assert ("GET", API_PREFIX + "/admin/users") not in paths
    assert ("GET", API_PREFIX + "/me") in paths
    assert ("GET", API_PREFIX + "/stream/{stream}") in paths


async def test_nothing_answers_403_to_the_signed_in_person(client: httpx.AsyncClient, migrated: Settings) -> None:
    token = (await login(client))["access_token"]
    try:
        for method, path, body in ENDPOINTS:
            res = await _call(client, method, path, body, token)
            assert res.status_code not in (401, 403), (method, path, res.text)
    finally:
        await reseed_test_db(migrated)


async def test_signed_out_is_401_and_validation_is_422(client: httpx.AsyncClient) -> None:
    res = await client.get(f"{API_PREFIX}/risk/status")
    assert res.status_code == 401
    session = await login(client)
    short = await _call(client, "POST", "/risk/kill-switch", {"reason": "abc"}, session["access_token"])
    assert short.status_code == 422
    assert short.json() == {"detail": "Gerekçe en az 5 harf olmalı.", "code": "validation"}
    note = await _call(client, "POST", "/approvals/p/notes", {"body": "a"}, session["access_token"])
    assert note.json() == {"detail": "Not en az 3 harf olmalı", "code": "validation"}


async def test_unknown_route_and_health(client: httpx.AsyncClient) -> None:
    missing = await client.get(f"{API_PREFIX}/nope")
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Kayıt bulunamadı.", "code": "not_found"}
    health = await client.get(f"{API_PREFIX}/health")
    assert health.status_code == 200
    data = health.json()
    assert data["db"] == "ok"
    assert "demo_mode" not in data
    assert data["now"].startswith("2027-01-11T10:4")  # the demo clock
