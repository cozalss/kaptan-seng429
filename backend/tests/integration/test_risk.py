"""Risk status: information only. There is no stop, no restart and no automatic brake."""

from __future__ import annotations

import json

import httpx
import pytest

from kaptan.api.main import API_PREFIX
from kaptan.db import connect
from kaptan.settings import Settings
from tests.conftest import bearer, login, reseed_test_db
from tests.contract.harness import assert_matches
from tests.harness.fixtures import FIXTURE_DIR

pytestmark = pytest.mark.integration


async def _token(client: httpx.AsyncClient) -> str:
    session = await login(client)
    token: str = session["access_token"]
    return token


async def test_status_reads_the_seeded_desk_and_marks_the_book(client: httpx.AsyncClient) -> None:
    res = await client.get(f"{API_PREFIX}/risk/status", headers=bearer(await _token(client)))
    assert res.status_code == 200
    body = res.json()
    assert_matches("RiskStatus", body)
    expected = json.loads((FIXTURE_DIR / "expected" / "risk_status.json").read_text(encoding="utf-8"))
    assert body["as_of"].startswith("2027-01-11T10:4")
    marked = {"as_of": None, "equity": None, "daily_pnl_pct": None, "drawdown_pct": None}
    assert {**body, **marked} == {**expected, **marked}
    assert body["equity"] > 0 and body["drawdown_pct"] <= 0


async def test_a_big_loss_stops_nothing_and_status_has_no_stop_fields(
    client: httpx.AsyncClient, migrated: Settings
) -> None:
    token = await _token(client)
    app_conn = await connect(migrated.database_url.get_secret_value())
    try:
        # an old database may still hold the retired stop columns: nothing reads them, nothing sets them
        await app_conn.execute(
            "UPDATE trading.risk_state SET daily_pnl_pct = -0.2, drawdown_pct = -0.4, halted_today = true, "
            "kill_switch = 'on'"
        )
        await app_conn.commit()
        res = await client.get(f"{API_PREFIX}/risk/status", headers=bearer(token))
        assert res.status_code == 200
        body = res.json()
        assert_matches("RiskStatus", body)
        for gone in ("kill_switch", "kill_reason", "kill_at", "kill_by", "halted_today", "reset"):
            assert gone not in body
        for path in ("/risk/kill-switch", "/risk/kill-switch/reset/request", "/risk/kill-switch/reset/confirm"):
            post = await client.post(f"{API_PREFIX}{path}", json={"reason": "Deneme yazısı"}, headers=bearer(token))
            assert post.status_code in (404, 405)
        async with app_conn.cursor() as cur:
            await cur.execute("SELECT count(*) AS n FROM audit.audit_log WHERE action LIKE 'kill_switch.%%'")
            row = await cur.fetchone()
        assert row is not None and row["n"] == 0  # nothing engaged anything
        await app_conn.commit()
    finally:
        await app_conn.close()
        await reseed_test_db(migrated)
