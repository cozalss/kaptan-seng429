"""Every API.md endpoint is registered; RBAC refuses with the panel's texts; stubs answer 501 envelopes.

When a wave-2 package fills a router, its allowed-role call stops being 501: move that endpoint
from STUB_ENDPOINTS to the package's own tests (the 403 rows here stay valid).
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from kaptan.api.main import API_PREFIX, create_app
from kaptan.domain.permissions import denied_reason
from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

#: (method, path, body, action or None, an allowed role) for the 24 endpoints of API.md §3 (+ /stream).
ENDPOINTS: list[tuple[str, str, dict[str, Any] | None, str | None, str]] = [
    ("GET", "/disclosures/counters", None, None, "analyst"),
    ("GET", "/approvals?status=all", None, None, "auditor"),
    (
        "POST",
        "/approvals/prop-day-e1-krgcl/decision",
        {"decision": "approve", "approved_notional_try": None, "comment": ""},
        "proposal.decide",
        "risk_officer",
    ),
    ("GET", "/approvals/prop-day-e1-krgcl/notes", None, None, "analyst"),
    ("POST", "/approvals/prop-day-e1-krgcl/notes", {"body": "Bir not."}, "proposal.note", "analyst"),
    ("GET", "/runs/run-day-e1-krgcl/explain", None, None, "auditor"),
    ("GET", "/tickets", None, None, "analyst"),
    ("POST", "/tickets/T-2027-0111-020/mark", {"mark": "unfilled"}, "ticket.mark", "risk_officer"),
    ("GET", "/portfolio/positions", None, None, "analyst"),
    ("GET", "/portfolio/pnl?from=2026-12-01&to=2027-01-08", None, None, "analyst"),
    ("GET", "/risk/status", None, None, "auditor"),
    ("POST", "/risk/kill-switch", {"reason": "Test durdurma"}, "kill.stop", "admin"),
    ("POST", "/risk/kill-switch/reset/request", {"reason": "Olay incelendi, tamam."}, "kill.reset_start", "admin"),
    (
        "POST",
        "/risk/kill-switch/reset/confirm",
        {"reason": "Olay incelendi, tamam."},
        "kill.reset_confirm",
        "risk_officer",
    ),
    ("GET", "/limits", None, None, "analyst"),
    (
        "POST",
        "/limits/proposals",
        {"key": "risk_per_trade_pct", "value": 0.004, "reason": "Oynaklık arttı, azaltalım."},
        "limits.propose",
        "admin",
    ),
    ("POST", "/limits/proposals/2/decision", {"decision": "approve"}, "limits.decide", "risk_officer"),
    ("GET", "/audit?scope=all&limit=10", None, None, "analyst"),
    ("POST", "/audit/verify", None, "audit.verify", "auditor"),
    ("GET", "/admin/users", None, "users.view", "auditor"),
    ("POST", "/demo/inject", {"scenario": "e3_contract"}, "demo.run", "admin"),
    ("POST", "/demo/tamper", {"on": True}, "demo.run", "admin"),
    ("POST", "/demo/reset", None, "demo.run", "admin"),
    ("POST", "/sse/ticket", None, None, "analyst"),
]

DENIED_ROLE = {
    "proposal.decide": "analyst",
    "proposal.note": "auditor",
    "ticket.mark": "admin",
    "kill.stop": "auditor",
    "kill.reset_start": "risk_officer",
    "kill.reset_confirm": "admin",
    "limits.propose": "risk_officer",
    "limits.decide": "admin",
    "audit.verify": "analyst",
    "users.view": "risk_officer",
    "demo.run": "auditor",
}


async def _call(client: httpx.AsyncClient, method: str, path: str, body: Any, token: str) -> httpx.Response:
    return await client.request(method, f"{API_PREFIX}{path}", json=body, headers=bearer(token))


def test_every_contract_route_is_registered() -> None:
    spec = create_app().openapi()
    paths = {(m.upper(), p) for p, ops in spec["paths"].items() for m in ops}
    for method, path, *_ in ENDPOINTS:
        template = path.split("?")[0]
        for concrete, param in (
            ("prop-day-e1-krgcl", "{proposal_id}"),
            ("run-day-e1-krgcl", "{run_id}"),
            ("T-2027-0111-020", "{ticket_no}"),
            ("/2/", "/{version}/"),
        ):
            template = template.replace(concrete, param)
        assert (method, API_PREFIX + template) in paths, (method, template)
    for extra in ("/auth/login", "/auth/role", "/auth/refresh", "/auth/logout"):
        assert ("POST", API_PREFIX + extra) in paths
    assert ("GET", API_PREFIX + "/me") in paths
    assert ("GET", API_PREFIX + "/stream/{stream}") in paths


@pytest.mark.parametrize(("method", "path", "body", "action", "_allowed"), [e for e in ENDPOINTS if e[3]])
async def test_forbidden_roles_get_the_plain_reason(
    client: httpx.AsyncClient, method: str, path: str, body: Any, action: str, _allowed: str
) -> None:
    role = DENIED_ROLE[action]
    session = await login(client, role)  # type: ignore[arg-type]
    res = await _call(client, method, path, body, session["access_token"])
    assert res.status_code == 403
    assert res.json() == {"detail": denied_reason(action, role), "code": "forbidden"}  # type: ignore[arg-type]


@pytest.mark.parametrize(("method", "path", "body", "_action", "role"), ENDPOINTS)
async def test_allowed_roles_reach_the_stub(
    client: httpx.AsyncClient, method: str, path: str, body: Any, _action: str | None, role: str
) -> None:
    session = await login(client, role)  # type: ignore[arg-type]
    res = await _call(client, method, path, body, session["access_token"])
    assert res.status_code == 501, res.text
    assert res.json()["code"] == "not_implemented"


async def test_signed_out_is_401_and_validation_is_422(client: httpx.AsyncClient) -> None:
    res = await client.get(f"{API_PREFIX}/risk/status")
    assert res.status_code == 401
    session = await login(client, "risk_officer")
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
    assert data["demo_mode"] is True
    assert data["now"].startswith("2027-01-11T10:4")  # the demo clock
