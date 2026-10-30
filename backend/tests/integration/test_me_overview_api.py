"""GET /me/overview: the single-user dashboard folded from /risk/status, /portfolio/*, /approvals."""

from __future__ import annotations

import httpx
import pytest

from kaptan.domain.schemas.overview import MeOverview
from kaptan.portfolio.overview import _allocations, _suggestions
from kaptan.settings import Settings
from tests.conftest import bearer, login, reseed_test_db

pytestmark = pytest.mark.integration


async def test_overview_on_the_demo_day(client: httpx.AsyncClient) -> None:
    token = (await login(client, "analyst"))["access_token"]
    res = await client.get("/api/v1/me/overview", headers=bearer(token))
    assert res.status_code == 200, res.text
    body = res.json()
    MeOverview.model_validate(body)
    status = (await client.get("/api/v1/risk/status", headers=bearer(token))).json()
    assert body["equity_now"] == status["equity"]
    assert body["pnl_abs"] == pytest.approx(body["equity_now"] - body["capital_start"])
    assert body["equity_series"] and all(set(p) == {"date", "equity"} for p in body["equity_series"])
    pending = (await client.get("/api/v1/approvals", headers=bearer(token))).json()
    assert [s["id"] for s in body["open_suggestions"]] == [c["proposal_id"] for c in pending]
    assert {s["action"] for s in body["open_suggestions"]} <= {"al", "sat"}
    invested = sum(a["amount"] for a in body["allocations"])
    assert body["cash"] == pytest.approx(max(0.0, body["equity_now"] - invested), abs=0.01)
    assert (await client.get("/api/v1/me/overview")).status_code == 401


async def test_hold_and_skip_are_audited(client: httpx.AsyncClient, migrated: Settings) -> None:
    token = (await login(client, "risk_officer"))["access_token"]
    card = (await client.get("/api/v1/approvals", headers=bearer(token))).json()[0]
    try:
        res = await client.post(
            f"/api/v1/me/suggestions/{card['proposal_id']}/hold", json={"note": "Bekliyorum."}, headers=bearer(token)
        )
        assert res.status_code == 200, res.text
        assert (res.json()["id"], res.json()["kind"]) == (card["proposal_id"], "held")
        skip = await client.post(
            f"/api/v1/me/suggestions/{card['proposal_id']}/hold", json={"kind": "skipped"}, headers=bearer(token)
        )
        assert skip.json()["kind"] == "skipped"
        audit = (await client.get("/api/v1/audit?limit=2", headers=bearer(token))).json()["items"]
        assert [e["action"] for e in audit] == ["suggestion.skipped", "suggestion.held"]
        assert audit[1]["payload"] == {"ticker": card["ticker"], "role": "risk_officer", "note": True}
        still = (await client.get("/api/v1/approvals", headers=bearer(token))).json()
        assert card["proposal_id"] in [c["proposal_id"] for c in still]  # the card stays open
        missing = await client.post("/api/v1/me/suggestions/nope/hold", json={}, headers=bearer(token))
        assert missing.status_code == 404
        analyst = (await login(client, "analyst"))["access_token"]
        denied = await client.post(f"/api/v1/me/suggestions/{card['proposal_id']}/hold", json={},
                                   headers=bearer(analyst))  # fmt: skip
        assert denied.status_code == 403
    finally:
        await reseed_test_db(migrated)


def test_allocation_and_suggestion_mapping() -> None:
    rows = [
        {"ticker": "AAA", "company_name": "A", "qty": 10, "last_price": 11.0, "avg_cost": 10.0},
        {"ticker": "BBB", "company_name": "B", "qty": 100, "last_price": 9.0, "avg_cost": 10.0},
    ]
    alloc = _allocations(rows, 1000.0)
    assert [a["symbol"] for a in alloc] == ["BBB", "AAA"]
    assert alloc[1] == {"symbol": "AAA", "name": "A", "amount": 110.0, "weight": 0.11, "pnl_pct": 0.1}
    assert _allocations(rows[:1], 0.0)[0]["weight"] == 0.0
    cards = [
        {"proposal_id": "p1", "ticker": "AAA", "side": "sell", "headline_tr": "Stop", "size_multiplier": 1.0,
         "expires_at": "2027-01-12T06:50:00.000Z", "status": "pending", "run_id": "run-x"},
        {"proposal_id": "p2", "ticker": "AAA", "side": "buy", "headline_tr": "Al", "size_multiplier": 0.5,
         "expires_at": "2027-01-12T06:50:00.000Z", "status": "approved", "run_id": "run-y"},
        {"proposal_id": "p3", "ticker": "AAA", "side": "buy", "headline_tr": "Al", "size_multiplier": 0.5,
         "expires_at": "2027-01-12T06:50:00.000Z", "status": "pending", "run_id": "run-hist-1"},
    ]  # fmt: skip
    assert _suggestions(cards) == [
        {"id": "p1", "symbol": "AAA", "action": "sat", "reason_short": "Stop", "confidence": 1.0,
         "expires_at": "2027-01-12T06:50:00.000Z"}
    ]  # fmt: skip
