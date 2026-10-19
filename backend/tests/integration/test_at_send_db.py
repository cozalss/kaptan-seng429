"""R16 at send time before the order exists (06 R16, FR-28): a real run's approval re-checks the desk
now; a failure is audited, answered 409 and leaves the card pending. Demo cards keep M1's path
(the approvals suite covers that unchanged)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime

import httpx
import pytest

from kaptan.api.main import API_PREFIX
from kaptan.approvals.execute import wait_for_fills
from kaptan.db import DictConn, connect
from kaptan.portfolio.pnl import LIVE_STRATEGY
from kaptan.settings import Settings
from tests.conftest import bearer, login, reseed_test_db
from tests.integration.test_risk_live_db import rows

pytestmark = pytest.mark.integration

PROPOSAL, RUN = "prop-day-e1-krgcl", "run-day-e1-krgcl"


@pytest.fixture
async def live_card(migrated: Settings, seeded: object) -> AsyncIterator[DictConn]:
    """The pending KRGCL card turned into a real run's card on a flat, empty paper desk."""
    conn = await connect(migrated.database_url.get_secret_value())
    try:
        await conn.execute("UPDATE trading.agent_runs SET run_set = 'live' WHERE run_id = %s", (RUN,))
        for sql in ("DELETE FROM trading.fills", "DELETE FROM trading.positions"):
            await conn.execute(sql)
        await conn.execute("DELETE FROM trading.pnl_daily WHERE strategy = %s", (LIVE_STRATEGY,))
        await conn.execute("DELETE FROM core.restriction_refresh")
        await conn.commit()
        yield conn
    finally:
        await conn.rollback()
        await conn.close()
        await wait_for_fills()
        await reseed_test_db(migrated)


async def _approve(client: httpx.AsyncClient) -> httpx.Response:
    token = (await login(client, "risk_officer"))["access_token"]
    return await client.post(
        f"{API_PREFIX}/approvals/{PROPOSAL}/decision",
        json={"decision": "approve", "approved_notional_try": None, "comment": ""},
        headers=bearer(token),
    )


async def _card_status(conn: DictConn) -> str:
    out = await rows(conn, "SELECT status FROM trading.approvals WHERE proposal_id = %s", (PROPOSAL,))
    await conn.commit()
    return str(out[0]["status"])


async def _last_audit(conn: DictConn) -> dict[str, object]:
    out = await rows(conn, "SELECT actor, action, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1")
    await conn.commit()
    return out[0]


async def test_unknown_restrictions_block_then_a_hard_restriction_then_it_sends(
    client: httpx.AsyncClient, live_card: DictConn
) -> None:
    stale = await _approve(client)
    assert stale.status_code == 409, stale.text
    assert stale.json() == {
        "detail": "Gönderim anında R04 geçmedi: Tedbir verisi 24 saatten eski: HOLD.",
        "code": "conflict",
    }
    audit = await _last_audit(live_card)
    assert (audit["actor"], audit["action"]) == ("system:risk_gate", "risk.rejected")
    payload = audit["payload"]
    assert isinstance(payload, dict)
    assert (payload["rule_code"], payload["failed_rule"], payload["limits_version"]) == ("R16", "R04", 1)
    assert await _card_status(live_card) == "pending"
    assert await rows(live_card, "SELECT id FROM trading.orders WHERE proposal_id = %s", (PROPOSAL,)) == []
    await live_card.commit()

    now = datetime.now(UTC)
    await live_card.execute(
        "INSERT INTO core.restriction_refresh (source, refreshed_at, n_rows) VALUES ('test', %s, 1)",
        (datetime(2027, 1, 11, 7, 0, tzinfo=UTC),),
    )
    await live_card.execute(
        "INSERT INTO core.restricted_securities (id, ticker, kind, source_ref, added_at, added_by) "
        "VALUES ('test-r16', 'KRGCL', 'spk_tedbir', 'test', %s, 'test')",
        (now,),
    )
    await live_card.commit()
    hard = await _approve(client)
    assert hard.status_code == 409
    assert hard.json()["detail"].startswith("Gönderim anında R04 geçmedi: Tedbirli hisse (spk_tedbir)")

    await live_card.execute("DELETE FROM core.restricted_securities WHERE id = 'test-r16'")
    await live_card.commit()
    ok = await _approve(client)
    assert ok.status_code == 200, ok.text
    assert ok.json()["status"] == "approved"
    assert await _card_status(live_card) == "approved"
    orders = await rows(live_card, "SELECT broker FROM trading.orders WHERE proposal_id = %s", (PROPOSAL,))
    assert {"broker": "simbist"} in orders
    await live_card.commit()


async def test_a_daily_halt_blocks_through_the_decision_check(client: httpx.AsyncClient, live_card: DictConn) -> None:
    await live_card.execute("UPDATE trading.risk_state SET halted_today = true")
    await live_card.commit()
    res = await _approve(client)
    assert res.status_code == 409 and res.json()["code"] == "halted"
