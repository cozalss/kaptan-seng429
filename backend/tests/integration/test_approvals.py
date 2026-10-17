"""GET/POST /approvals… (package A): parity with the mock on a fresh seed, the decision rules, notes,
and the execution after an approval (ticket, SimBIST order, fill, positions, audit, SSE)."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest
import redis.asyncio as aioredis

import kaptan.approvals.execute as execute
from kaptan.events import bus
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

APPROVE = {"decision": "approve", "approved_notional_try": None, "comment": ""}


async def test_list_all_matches_the_mock_and_the_schema(api: httpx.AsyncClient) -> None:
    res = await call(api, "auditor", "GET", "/approvals?status=all")
    assert res.status_code == 200, res.text
    assert_matches("ApprovalCard", res.json(), many=True)
    assert res.json() == expected("approvals_all.json")


async def test_pending_is_the_default_filter(api: httpx.AsyncClient) -> None:
    res = await call(api, "analyst", "GET", "/approvals")
    want = [c["proposal_id"] for c in expected("approvals_all.json") if c["status"] == "pending"]
    assert [c["proposal_id"] for c in res.json()] == want


async def test_kill_switch_cancels_pending_cards(api: httpx.AsyncClient, migrated: Settings) -> None:
    await sql(migrated, "UPDATE trading.risk_state SET kill_switch = 'on', kill_reason = 'test' WHERE id = 1")
    cards = (await call(api, "analyst", "GET", "/approvals?status=all")).json()
    assert {c["status"] for c in cards} == {"cancelled", "approved", "rejected"}
    res = await call(api, "risk_officer", "POST", "/approvals/prop-day-e1-krgcl/decision", APPROVE)
    assert (res.status_code, res.json()) == (
        409,
        {"detail": "Her şey durduruldu: yeni emir onaylanamaz.", "code": "kill_switch"},
    )


@pytest.mark.parametrize(
    ("proposal", "body", "status", "code", "detail"),
    [
        ("prop-nope", APPROVE, 404, "not_found", "Öneri bulunamadı."),
        ("prop-day-e1-tmsmk", APPROVE, 409, "conflict", "Bu öneri zaten karara bağlandı ya da süresi doldu."),
        (
            "prop-day-e1-krgcl",
            {**APPROVE, "approved_notional_try": 10_000_000},
            422,
            "grow_not_allowed",
            "Tutar yalnızca küçültülebilir; büyütme yok.",
        ),
        ("run-hist-101".replace("run", "prop"), APPROVE, 409, "conflict", None),
    ],
)
async def test_decision_refusals(
    api: httpx.AsyncClient, proposal: str, body: dict[str, object], status: int, code: str, detail: str | None
) -> None:
    res = await call(api, "risk_officer", "POST", f"/approvals/{proposal}/decision", body)
    assert res.status_code == status, res.text
    assert res.json()["code"] == code
    if detail:
        assert res.json()["detail"] == detail


async def test_halt_blocks_approvals_but_not_rejections(api: httpx.AsyncClient, migrated: Settings) -> None:
    await sql(migrated, "UPDATE trading.risk_state SET halted_today = true WHERE id = 1")
    res = await call(api, "risk_officer", "POST", "/approvals/prop-day-e1-krgcl/decision", APPROVE)
    assert (res.status_code, res.json()["code"]) == (409, "halted")
    assert res.json()["detail"] == "Günlük −%1 durdurması: bugün yeni emir verilemez."
    reject = {"decision": "reject", "approved_notional_try": None, "comment": "Kanıt zayıf."}
    ok = await call(api, "risk_officer", "POST", "/approvals/prop-day-e1-krgcl/decision", reject)
    assert ok.status_code == 200, ok.text
    card = ok.json()
    assert_matches("ApprovalCard", card)
    assert (card["status"], card["decided_by"], card["decided_role"], card["decision_comment"]) == (
        "rejected",
        "uye-3",
        "risk_officer",
        "Kanıt zayıf.",
    )
    assert card["approved_notional_try"] is None
    again = await call(api, "risk_officer", "POST", "/approvals/prop-day-e1-krgcl/decision", reject)
    assert again.status_code == 409
    rows = await sql(
        migrated,
        "SELECT actor, payload, strategy_version FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1",
    )
    assert rows[0]["actor"] == "user:uye-3"
    assert rows[0]["strategy_version"] == "v1.1-fwd"
    assert rows[0]["payload"] == {
        "ticker": "KRGCL",
        "company": card["company_name"],
        "decision": "reject",
        "role": "risk_officer",
        "note": True,
    }
    assert not await sql(migrated, "SELECT 1 FROM trading.orders WHERE proposal_id = 'prop-day-e1-krgcl'")


async def test_approving_an_auction_card_places_an_opg_order_and_a_ticket(
    api: httpx.AsyncClient, migrated: Settings
) -> None:
    body = {"decision": "approve", "approved_notional_try": 30_000, "comment": ""}
    res = await call(api, "risk_officer", "POST", "/approvals/prop-day-e1-krgcl/decision", body)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "approved"
    assert res.json()["approved_notional_try"] == 30_000
    order = (await sql(migrated, "SELECT * FROM trading.orders WHERE id = 'ord-s-day-e1-krgcl'"))[0]
    assert (order["tif"], order["status"], order["qty"]) == ("opg", "pending_open", 878)
    explain = (await call(api, "auditor", "GET", "/runs/run-day-e1-krgcl/explain")).json()
    assert_matches("Explain", explain)
    assert explain["run"]["status"] == "completed"
    assert explain["ticket"]["ticket_no"] == "T-2027-0111-010"
    assert [o["broker"] for o in explain["orders"]] == ["simbist", "order_ticket"]
    tickets = (await call(api, "analyst", "GET", "/tickets")).json()
    assert tickets[0]["ticket_no"] == "T-2027-0111-010"
    actions = await sql(migrated, "SELECT action FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 2")
    assert [r["action"] for r in actions] == ["ticket.issued", "approval.decided"]


async def test_demo_e3_end_to_end_with_fill_position_and_sse(
    api: httpx.AsyncClient, migrated: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(execute, "FILL_DELAY_S", 0.05)
    redis = aioredis.from_url(migrated.redis_url.get_secret_value(), decode_responses=True)
    try:
        await asyncio.wait_for(redis.ping(), timeout=3)
    except Exception as exc:  # pragma: no cover - Redis down
        await redis.aclose()
        pytest.skip(f"compose Redis unreachable: {exc}")
    try:
        await inject_demo_e3(migrated, seconds_ago=1)
        in_flight = await call(api, "risk_officer", "POST", f"/approvals/{DEMO_E3_PROPOSAL}/decision", APPROVE)
        assert in_flight.status_code == 404  # the card does not exist while the run is still working
        await inject_demo_e3(migrated, seconds_ago=30)
        before = await bus.latest_id(redis, bus.stream_key("desk"))
        res = await call(api, "risk_officer", "POST", f"/approvals/{DEMO_E3_PROPOSAL}/decision", APPROVE)
        assert res.status_code == 200, res.text
        await execute.wait_for_fills()
        events = await redis.xrange(bus.stream_key("desk"), min=f"({before}", max="+")
        names = [fields["event"] for _, fields in events]
        assert names[:4] == ["approval.decided", "ticket", "order", "fill"], names
        decided = json.loads(events[0][1]["data"])
        assert (decided["proposal_id"], decided["status"]) == (DEMO_E3_PROPOSAL, "approved")
        frames = bus.frames(redis, "desk", last_event_id=before, is_disconnected=_never, keepalive_s=1)
        assert await anext(frames) == ": ok\n\n"
        first = await asyncio.wait_for(anext(frames), timeout=1)
        assert "event: approval.decided" in first
        await frames.aclose()
    finally:
        await redis.aclose()
    explain = (await call(api, "auditor", "GET", f"/runs/{DEMO_E3_RUN}/explain")).json()
    assert_matches("Explain", explain)
    simbist = explain["orders"][0]
    assert (simbist["status"], simbist["fills"][0]["price"]) == ("filled", 48.32)
    assert explain["ticket"]["ticket_no"] == DEMO_TICKET
    positions = await sql(
        migrated, "SELECT book, qty, avg_cost FROM trading.positions WHERE run_id = %s", (DEMO_E3_RUN,)
    )
    assert positions == [{"book": "paper", "qty": simbist["qty"], "avg_cost": 48.32}]
    last = await sql(migrated, "SELECT actor, action, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1")
    assert (last[0]["actor"], last[0]["action"]) == ("system:simbist", "order.filled")


async def _never() -> bool:
    return False


async def test_notes_list_add_and_refuse(api: httpx.AsyncClient, migrated: Settings) -> None:
    assert (await call(api, "analyst", "GET", "/approvals/prop-day-e1-krgcl/notes")).json() == []
    first = await call(api, "analyst", "POST", "/approvals/prop-day-e1-krgcl/notes", {"body": "  Hacim düşük.  "})
    assert first.status_code == 200, first.text
    assert_matches("ProposalNote", first.json())
    assert (first.json()["id"], first.json()["body"], first.json()["uid"]) == ("not-1", "Hacim düşük.", "uye-2")
    second = await call(api, "admin", "POST", "/approvals/prop-day-e1-krgcl/notes", {"body": "Tamam, izleyelim."})
    assert second.json()["id"] == "not-2"
    notes = (await call(api, "auditor", "GET", "/approvals/prop-day-e1-krgcl/notes")).json()
    assert_matches("ProposalNote", notes, many=True)
    assert [n["id"] for n in notes] == ["not-1", "not-2"]
    missing = await call(api, "analyst", "POST", "/approvals/prop-nope/notes", {"body": "Bir not."})
    assert missing.json() == {"detail": "Öneri bulunamadı.", "code": "not_found"}
    audit = await sql(migrated, "SELECT action, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1")
    assert audit[0]["action"] == "note.added"
    assert audit[0]["payload"]["role"] == "admin"
