"""Package B: risk status, kill switch + restart, the loss simulation steps."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from kaptan.api.main import API_PREFIX
from kaptan.audit.verify import verify_db
from kaptan.db import DictConn, connect
from kaptan.settings import Settings
from tests.conftest import bearer, login, reseed_test_db
from tests.contract.harness import assert_matches
from tests.harness.fixtures import FIXTURE_DIR
from tests.integration.a_support import as_if_the_wait_is_over

pytestmark = pytest.mark.integration

STOP = "/risk/kill-switch"
REQUEST = "/risk/kill-switch/reset/request"
CONFIRM = "/risk/kill-switch/reset/confirm"


async def _token(client: httpx.AsyncClient) -> str:
    session = await login(client)
    token: str = session["access_token"]
    return token


async def _post(client: httpx.AsyncClient, path: str, token: str, reason: str) -> httpx.Response:
    return await client.post(f"{API_PREFIX}{path}", json={"reason": reason}, headers=bearer(token))


async def _last_audit(conn: DictConn, n: int = 1) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT actor, action, entity_type, entity_id, payload FROM audit.audit_log "
            "ORDER BY chain_pos DESC LIMIT %s",
            (n,),
        )
        rows = await cur.fetchall()
    await conn.commit()
    return list(reversed(rows))


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


async def test_kill_switch_and_restart(client: httpx.AsyncClient, migrated: Settings) -> None:
    token = await _token(client)
    app_conn = await connect(migrated.database_url.get_secret_value())
    try:
        # an open SimBIST order is canceled by the stop
        await app_conn.execute("UPDATE trading.orders SET status = 'accepted' WHERE id = 'ord-hist-107'")
        await app_conn.commit()

        early = await _post(client, REQUEST, token, "Olay incelendi, tamam.")
        assert early.status_code == 409 and early.json() == {
            "detail": "Sistem çalışıyor; yeniden başlatılacak bir şey yok.",
            "code": "not_on",
        }
        assert (await _post(client, CONFIRM, token, "Olay incelendi, tamam.")).json()["code"] == "not_on"

        stop = await _post(client, STOP, token, "  Piyasa çok oynak  ")
        assert stop.status_code == 200, stop.text
        s = stop.json()
        assert_matches("RiskStatus", s)
        assert (s["kill_switch"], s["kill_by"], s["kill_reason"], s["reset"]) == (
            "on",
            "user:sahip",
            "Piyasa çok oynak",
            {"started": None, "ready_at": None},
        )
        (entry,) = await _last_audit(app_conn)
        assert entry["action"] == "kill_switch.on"
        assert entry["payload"] == {"reason": "Piyasa çok oynak", "role": "risk_officer", "canceled_orders": 1}
        async with app_conn.cursor() as cur:
            await cur.execute("SELECT status, cancel_reason FROM trading.orders WHERE id = 'ord-hist-107'")
            assert await cur.fetchone() == {"status": "canceled", "cancel_reason": "kill_switch"}
        await app_conn.commit()
        positions = await client.get(f"{API_PREFIX}/portfolio/positions", headers=bearer(token))
        assert all(p["managed_by_exit_rule"] for p in positions.json())

        again = await _post(client, STOP, token, "Bir daha durdur")
        assert again.status_code == 409 and again.json() == {"detail": "Zaten durduruldu.", "code": "already_on"}
        not_started = await _post(client, CONFIRM, token, "Olay incelendi, tamam.")
        assert not_started.status_code == 409 and not_started.json() == {
            "detail": "Önce yeniden başlatma isteği göndermelisin.",
            "code": "not_started",
        }

        start = await _post(client, REQUEST, token, "Olay incelendi, eşikler doğru çalıştı.")
        assert start.status_code == 200
        assert start.json()["reset"]["ready_at"] == "2027-01-18T07:00:00.000Z"  # five sessions after the stop
        started = start.json()["reset"]["started"]
        assert (started["uid"], started["reason"]) == ("sahip", "Olay incelendi, eşikler doğru çalıştı.")
        (entry,) = await _last_audit(app_conn)
        assert (entry["action"], entry["payload"]) == (
            "kill_switch.reset_started",
            {"step": 1, "role": "risk_officer", "reason": "Olay incelendi, eşikler doğru çalıştı."},
        )
        dup = await _post(client, REQUEST, token, "Olay incelendi, tekrar.")
        assert dup.status_code == 409 and dup.json()["code"] == "already_started"

        early = await _post(client, CONFIRM, token, "Yeniden başlatıyorum.")
        assert early.status_code == 409 and early.json()["code"] == "conflict"

        await app_conn.execute("UPDATE trading.risk_state SET drawdown_pct = -0.06")
        await app_conn.commit()
        await as_if_the_wait_is_over(app_conn)

        done = await _post(client, CONFIRM, token, "Yeniden başlatıyorum.")
        assert done.status_code == 200
        d = done.json()
        assert_matches("RiskStatus", d)
        assert (d["kill_switch"], d["reset"], d["kill_by"]) == ("off", None, None)
        async with app_conn.cursor() as cur:
            await cur.execute("SELECT drawdown_pct, reset_at FROM trading.risk_state")
            state = await cur.fetchone()
        assert state is not None and float(state["drawdown_pct"]) == -0.049 and state["reset_at"] is not None
        await app_conn.commit()
        (waiver, entry) = await _last_audit(app_conn, 2)
        assert waiver["action"] == "auth.single_user_waiver" and waiver["payload"]["flow"] == "kill_reset"
        assert (entry["action"], entry["payload"]) == (
            "kill_switch.reset",
            {"step": 2, "role": "risk_officer", "reason": "Yeniden başlatıyorum.", "started_by": "sahip"},
        )
        assert (await verify_db(app_conn, "2027-01-11T11:00:00.000Z"))["ok"] is True
        await app_conn.commit()
    finally:
        await app_conn.close()
        await reseed_test_db(migrated)
