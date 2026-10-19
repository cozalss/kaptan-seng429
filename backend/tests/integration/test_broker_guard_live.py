"""GuardedBroker at send and the three live keys (M3 A3, FR-28, 09 §8)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from kaptan.api.errors import ApiError
from kaptan.brokers import config as bc
from kaptan.brokers import live_arm
from kaptan.brokers.config import ExecConfig, TradingConfig
from kaptan.db import DictConn
from tests.integration.a_support import api, call, fresh, sql
from tests.integration.test_fill_engine import DECIDE_AT, KRGCL, approved_krgcl, desk, last_audit, order

pytestmark = pytest.mark.integration
__all__ = ["api", "desk", "fresh"]

NOW = datetime(2027, 1, 11, 11, 0, tzinfo=UTC)


async def test_hard_cap_refuses_the_order_at_send(desk: DictConn) -> None:
    bc.install(ExecConfig(demo_mode=False, trading=TradingConfig(hard_cap_try=Decimal(1000))))
    outcome = await approved_krgcl(desk)
    assert outcome.events[-1][1]["status"] == "rejected"
    assert (await order(desk))["status"] == "rejected"
    audit = await last_audit(desk)
    assert (audit["action"], audit["payload"]["code"]) == ("order.refused", "hard_cap")


async def test_live_request_falls_back_to_paper_and_is_audited(desk: DictConn) -> None:
    bc.install(ExecConfig(demo_mode=False, trading=TradingConfig(mode="live"), live_env_enabled=True))
    await approved_krgcl(desk)
    o = await order(desk)
    assert (o["broker"], o["status"]) == ("simbist", "pending_open")
    async with desk.cursor() as cur:
        await cur.execute("SELECT payload FROM audit.audit_log WHERE action = 'broker.live_fallback'")
        rows = await cur.fetchall()
    assert rows[-1]["payload"]["missing"] == ["ui_armed", "real_broker"]
    assert DECIDE_AT and KRGCL


async def test_arm_two_signatures_same_person_and_kill_switch(desk: DictConn) -> None:
    cfg = ExecConfig(demo_mode=False)
    kw = {"name": "x", "reason": "Canlı deneme için anahtar.", "now": NOW}
    with pytest.raises(ApiError) as e:
        await live_arm.change(desk, cfg, "confirm", uid="uye-3", role="risk_officer", **kw)  # type: ignore[arg-type]
    assert e.value.code == "not_started"
    await live_arm.change(desk, cfg, "start", uid="uye-1", role="admin", **kw)  # type: ignore[arg-type]
    with pytest.raises(ApiError) as e:
        await live_arm.change(desk, cfg, "confirm", uid="uye-1", role="risk_officer", **kw)  # type: ignore[arg-type]
    assert e.value.code == "same_person"
    await desk.execute("UPDATE trading.risk_state SET kill_switch = 'on'")
    with pytest.raises(ApiError) as e:
        await live_arm.change(desk, cfg, "confirm", uid="uye-3", role="risk_officer", **kw)  # type: ignore[arg-type]
    assert e.value.code == "kill_switch"


async def test_live_endpoints(api: httpx.AsyncClient, migrated: object) -> None:
    res = await call(api, "auditor", "GET", "/admin/live")
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["armed"], body["effective_mode"], body["started"]) == (False, "paper", None)
    assert (await call(api, "analyst", "GET", "/admin/live")).status_code == 403
    reason = {"reason": "Canlı deneme için anahtar."}
    assert (
        await call(api, "risk_officer", "POST", "/admin/live/arm", {"action": "start", **reason})
    ).status_code == 403
    started = await call(api, "admin", "POST", "/admin/live/arm", {"action": "start", **reason})
    assert started.status_code == 200 and started.json()["started"]["role"] == "admin"
    armed = await call(api, "risk_officer", "POST", "/admin/live/arm", {"action": "confirm", **reason})
    view = armed.json()
    assert (view["ui_key"], view["armed"], view["missing"]) == (True, False, ["config", "env", "real_broker"])
    assert view["armed_by"]["role"] == "risk_officer"
    off = await call(api, "admin", "POST", "/admin/live/arm", {"action": "disarm", **reason})
    assert off.json()["ui_key"] is False
    rows = await sql(migrated, "SELECT action FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 3")  # type: ignore[arg-type]
    assert [r["action"] for r in rows] == ["live.disarmed", "live.armed", "live.arm_started"]
