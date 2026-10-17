"""Package B: risk status, kill switch + two-person restart, the loss simulation steps."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from psycopg.types.json import Jsonb

from kaptan.api.main import API_PREFIX
from kaptan.audit.verify import verify_db
from kaptan.db import DictConn, connect
from kaptan.demo.fixtures import FIXTURE_DIR
from kaptan.domain.schemas import RiskStatus
from kaptan.risk.loss_simulation import LOSS_DAILY, demo_now, run_loss_step
from kaptan.settings import Settings
from tests.conftest import bearer, login, reseed_test_db
from tests.contract.harness import assert_matches

pytestmark = pytest.mark.integration

STOP = "/risk/kill-switch"
REQUEST = "/risk/kill-switch/reset/request"
CONFIRM = "/risk/kill-switch/reset/confirm"


async def _token(client: httpx.AsyncClient, role: str) -> str:
    session = await login(client, role)  # type: ignore[arg-type]
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


async def test_status_matches_the_mock_at_13_40(client: httpx.AsyncClient) -> None:
    res = await client.get(f"{API_PREFIX}/risk/status", headers=bearer(await _token(client, "auditor")))
    assert res.status_code == 200
    body = res.json()
    assert_matches("RiskStatus", body)
    expected = json.loads((FIXTURE_DIR / "expected" / "risk_status.json").read_text(encoding="utf-8"))
    assert body["as_of"].startswith("2027-01-11T10:4")
    assert {**body, "as_of": None} == {**expected, "as_of": None}


async def test_kill_switch_and_two_person_restart(client: httpx.AsyncClient, migrated: Settings) -> None:
    admin, risk = await _token(client, "admin"), await _token(client, "risk_officer")
    app_conn = await connect(migrated.database_url.get_secret_value())
    try:
        # an open SimBIST order is canceled by the stop
        await app_conn.execute("UPDATE trading.orders SET status = 'accepted' WHERE id = 'ord-hist-107'")
        await app_conn.commit()

        early = await _post(client, REQUEST, admin, "Olay incelendi, tamam.")
        assert early.status_code == 409 and early.json() == {
            "detail": "Sistem çalışıyor; yeniden başlatılacak bir şey yok.",
            "code": "not_on",
        }
        assert (await _post(client, CONFIRM, risk, "Olay incelendi, tamam.")).json()["code"] == "not_on"

        stop = await _post(client, STOP, risk, "  Piyasa çok oynak  ")
        assert stop.status_code == 200, stop.text
        s = stop.json()
        assert_matches("RiskStatus", s)
        assert (s["kill_switch"], s["kill_by"], s["kill_reason"], s["reset"]) == (
            "on",
            "user:uye-3",
            "Piyasa çok oynak",
            {"started": None},
        )
        (entry,) = await _last_audit(app_conn)
        assert entry["action"] == "kill_switch.on"
        assert entry["payload"] == {"reason": "Piyasa çok oynak", "role": "risk_officer", "canceled_orders": 1}
        async with app_conn.cursor() as cur:
            await cur.execute("SELECT status, cancel_reason FROM trading.orders WHERE id = 'ord-hist-107'")
            assert await cur.fetchone() == {"status": "canceled", "cancel_reason": "kill_switch"}
        await app_conn.commit()
        positions = await client.get(f"{API_PREFIX}/portfolio/positions", headers=bearer(risk))
        assert all(p["managed_by_exit_rule"] for p in positions.json())

        again = await _post(client, STOP, admin, "Bir daha durdur")
        assert again.status_code == 409 and again.json() == {"detail": "Zaten durduruldu.", "code": "already_on"}
        not_started = await _post(client, CONFIRM, risk, "Olay incelendi, tamam.")
        assert not_started.status_code == 409 and not_started.json() == {
            "detail": "Önce Yönetici yeniden başlatmayı başlatmalı (1/2).",
            "code": "not_started",
        }

        start = await _post(client, REQUEST, admin, "Olay incelendi, eşikler doğru çalıştı.")
        assert start.status_code == 200
        started = start.json()["reset"]["started"]
        assert (started["uid"], started["role"], started["reason"]) == (
            "uye-1",
            "admin",
            "Olay incelendi, eşikler doğru çalıştı.",
        )
        (entry,) = await _last_audit(app_conn)
        assert (entry["action"], entry["payload"]) == (
            "kill_switch.reset_started",
            {"step": 1, "role": "admin", "reason": "Olay incelendi, eşikler doğru çalıştı."},
        )
        dup = await _post(client, REQUEST, admin, "Olay incelendi, tekrar.")
        assert dup.status_code == 409 and dup.json()["code"] == "already_started"

        # same person: the restart was started by the Risk Sorumlusu's own uid
        sig = {**started, "uid": "uye-3"}
        await app_conn.execute("UPDATE trading.risk_state SET reset_started = %s", (Jsonb(sig),))
        await app_conn.commit()
        same = await _post(client, CONFIRM, risk, "Olay incelendi, tamam.")
        assert same.status_code == 403 and same.json() == {
            "detail": "Başlatan kişi onaylayamaz; ikinci imza başka birinden gelir.",
            "code": "same_person",
        }
        await app_conn.execute("UPDATE trading.risk_state SET reset_started = %s", (Jsonb(started),))
        await app_conn.execute("UPDATE trading.risk_state SET drawdown_pct = -0.06")
        await app_conn.commit()

        done = await _post(client, CONFIRM, risk, "İkinci imza: yeniden başlat.")
        assert done.status_code == 200
        d = done.json()
        assert_matches("RiskStatus", d)
        assert (d["kill_switch"], d["reset"], d["kill_by"], d["drawdown_pct"]) == ("off", None, None, -0.049)
        assert d["peak_equity"] == round(d["equity"] / (1 - 0.049))
        (entry,) = await _last_audit(app_conn)
        assert (entry["action"], entry["payload"]) == (
            "kill_switch.reset",
            {"step": 2, "role": "risk_officer", "reason": "İkinci imza: yeniden başlat.", "started_by": "uye-1"},
        )
        assert (await verify_db(app_conn, "2027-01-11T11:00:00.000Z"))["ok"] is True
        await app_conn.commit()
    finally:
        await app_conn.close()
        await reseed_test_db(migrated)


async def test_loss_simulation_halts_then_kills(migrated: Settings) -> None:
    conn = await connect(migrated.database_url.get_secret_value())
    try:
        now = await demo_now(conn)
        await conn.commit()
        steps = [await run_loss_step(conn, i, now=now) for i in range(len(LOSS_DAILY))]
        assert [s.halted for s in steps] == [False, False, True, False, False, False]
        assert [s.killed for s in steps] == [False] * 5 + [True]
        assert [s.event for s in steps] == ["halt"] * 5 + ["kill_switch"]
        last = RiskStatus.model_validate(steps[-1].status).model_dump(mode="json")
        assert_matches("RiskStatus", last)
        assert (last["kill_switch"], last["kill_by"], last["halted_today"]) == ("on", "system:risk_monitor", True)
        assert last["daily_pnl_pct"] == -0.0392 and last["drawdown_pct"] <= -0.05
        entries = await _last_audit(conn, 2)
        assert [e["action"] for e in entries] == ["risk.halted", "kill_switch.on"]
        assert entries[0]["payload"] == {"daily_pnl_pct": -0.0112}
        assert entries[1]["payload"] == {"reason": "Zirveden −%5 düşüş (R01)", "role": None, "canceled_orders": 0}
        with pytest.raises(ValueError, match="loss step"):
            await run_loss_step(conn, 6, now=now)
        default_now = await run_loss_step(conn, 0)  # clock from ops.demo_state
        assert default_now.status["as_of"] >= now
        assert last["kill_at"].endswith("Z") and len(last["kill_at"]) == 24
    finally:
        await conn.close()
        await reseed_test_db(migrated)
