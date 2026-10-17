"""GET /tickets and POST /tickets/{no}/mark (package A): parity, the mark rules, the personal position."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

import kaptan.approvals.execute as execute
from kaptan.settings import Settings
from tests.contract.harness import assert_matches
from tests.integration.a_support import (
    DEMO_E3_PROPOSAL,
    DEMO_E3_RUN,
    DEMO_TICKET,
    api,
    call,
    expected,
    fresh,
    inject_demo_e3,
    sql,
)

pytestmark = pytest.mark.integration
__all__ = ["api", "fresh"]

FIXTURE_TICKET = "T-2027-0111-020"


async def test_list_matches_the_mock(api: httpx.AsyncClient) -> None:
    res = await call(api, "analyst", "GET", "/tickets")
    assert res.status_code == 200
    assert_matches("OrderTicket", res.json(), many=True)
    assert res.json() == expected("tickets.json")


async def test_mark_an_expired_ticket_unfilled_once(api: httpx.AsyncClient, migrated: Settings) -> None:
    res = await call(api, "risk_officer", "POST", f"/tickets/{FIXTURE_TICKET}/mark", {"mark": "unfilled", "note": " "})
    assert res.status_code == 200, res.text
    assert_matches("OrderTicket", res.json())
    entry = res.json()["entry"]
    assert (entry["status"], entry["note"], entry["filled_qty"]) == ("unfilled", None, None)
    again = await call(api, "risk_officer", "POST", f"/tickets/{FIXTURE_TICKET}/mark", {"mark": "canceled"})
    assert again.json() == {"detail": "Bu fiş zaten işaretlendi.", "code": "already_marked"}
    explain = (await call(api, "auditor", "GET", "/runs/run-day-e1-tmsmk/explain")).json()
    assert explain["orders"][-1]["cancel_reason"] == "ticket_unfilled"
    audit = await sql(migrated, "SELECT action, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1")
    assert (audit[0]["action"], audit[0]["payload"]) == ("ticket.unfilled", {})


async def test_unknown_ticket_is_404(api: httpx.AsyncClient) -> None:
    res = await call(api, "risk_officer", "POST", "/tickets/T-0000-0000-000/mark", {"mark": "canceled"})
    assert res.json() == {"detail": "Fiş bulunamadı.", "code": "not_found"}


async def _approve_demo_e3(api: httpx.AsyncClient, migrated: Settings) -> None:
    await inject_demo_e3(migrated, seconds_ago=30)
    body = {"decision": "approve", "approved_notional_try": None, "comment": ""}
    res = await call(api, "risk_officer", "POST", f"/approvals/{DEMO_E3_PROPOSAL}/decision", body)
    assert res.status_code == 200, res.text


def _entered(**over: Any) -> dict[str, Any]:
    return {"mark": "entered", "filled_qty": 620, "avg_price": 48.32, "filled_at": "2027-01-11T10:50:00.000Z", **over}


@pytest.mark.parametrize(
    ("over", "code", "detail"),
    [
        ({"filled_qty": 621}, "over_qty", "Gerçekleşen adet fişteki adetten büyük olamaz."),
        ({"avg_price": 48.41}, "over_limit", "Limit emirde ortalama fiyat limit fiyatı aşamaz."),
        (
            {"filled_at": "2027-01-11T11:16:21.000Z"},
            "after_ttl",
            "Fişin geçerlilik süresinden sonra girilen emir sayılmaz (R16).",
        ),
    ],
)
async def test_entered_mark_refusals(
    api: httpx.AsyncClient,
    migrated: Settings,
    monkeypatch: pytest.MonkeyPatch,
    over: dict[str, Any],
    code: str,
    detail: str,
) -> None:
    monkeypatch.setattr(execute, "FILL_DELAY_S", 0.01)
    await _approve_demo_e3(api, migrated)
    res = await call(api, "risk_officer", "POST", f"/tickets/{DEMO_TICKET}/mark", _entered(**over))
    assert (res.status_code, res.json()) == (422, {"detail": detail, "code": code})


async def test_entered_mark_opens_a_personal_position(
    api: httpx.AsyncClient, migrated: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(execute, "FILL_DELAY_S", 0.01)
    await _approve_demo_e3(api, migrated)
    listed = (await call(api, "analyst", "GET", "/tickets")).json()
    assert listed[0]["ticket_no"] == DEMO_TICKET and listed[0]["entry"]["status"] == "awaiting"
    res = await call(api, "risk_officer", "POST", f"/tickets/{DEMO_TICKET}/mark", _entered(note="Garanti'de girdim."))
    assert res.status_code == 200, res.text
    entry = res.json()["entry"]
    assert (entry["status"], entry["filled_qty"], entry["avg_price"], entry["note"]) == (
        "entered",
        620,
        48.32,
        "Garanti'de girdim.",
    )
    personal = await sql(
        migrated, "SELECT qty, avg_cost FROM trading.positions WHERE book = 'personal' AND run_id = %s", (DEMO_E3_RUN,)
    )
    assert personal == [{"qty": 620, "avg_cost": 48.32}]
    explain = (await call(api, "auditor", "GET", f"/runs/{DEMO_E3_RUN}/explain")).json()
    ticket_order = explain["orders"][-1]
    assert (ticket_order["broker"], ticket_order["status"]) == ("order_ticket", "filled")
    assert ticket_order["fills"][0]["source"] == "manual"
    audit = await sql(migrated, "SELECT action, payload FROM audit.audit_log WHERE action = 'ticket.entered'")
    assert audit[0]["payload"] == {"qty": 620, "price": 48.32}
