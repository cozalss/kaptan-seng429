"""M4 package R against the DB: P8 cooldown + m_reset reach the agent's desk, and the security kill (06 §11 c)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from psycopg.types.json import Jsonb

from kaptan.agents.feed_run import desk_for
from kaptan.db import DictConn
from kaptan.risk.cooldown import cooldown_active
from kaptan.risk.desk import live_desk
from kaptan.risk.gate import COOLDOWN_TR, GateContext, GateOrder, evaluate
from kaptan.risk.kill_switch import confirm_reset, start_reset
from kaptan.risk.security_kill import SECURITY_MONITOR, check_security_kill, r11_rejected_runs

pytestmark = pytest.mark.integration

NOW = datetime(2026, 10, 20, 9, 0, tzinfo=UTC)  # Tuesday 12:00 Istanbul


async def rows(conn: DictConn, sql: str, params: Any = ()) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


async def any_proposal(conn: DictConn) -> str:
    return str(
        (await rows(conn, "SELECT proposal_id FROM trading.trade_proposals ORDER BY proposal_id LIMIT 1"))[0][
            "proposal_id"
        ]
    )


async def test_cooldown_reaches_the_agent_desk_and_the_gate(pg: DictConn) -> None:
    assert not await cooldown_active(pg, "ORNEK", NOW)
    assert not (await desk_for(pg, "ORNEK", now=NOW)).in_cooldown
    await pg.execute(
        "INSERT INTO trading.symbol_cooldowns (ticker, until_day, reason, exit_proposal, created_at) "
        "VALUES ('ORNEK', %s, 'X2_STOP', %s, %s)",
        ((NOW + timedelta(days=10)).date(), await any_proposal(pg), NOW),
    )
    assert await cooldown_active(pg, "ORNEK", NOW)
    desk = await desk_for(pg, "ORNEK", now=NOW)
    assert desk.in_cooldown
    order = GateOrder("ORNEK", "E1", 100, Decimal("47.4"), Decimal("0.08"),
                      evidence_ids=("a",) * 5, retrieved_ids=("a",), expected_edge_bps=Decimal(70),
                      est_cost_bps=Decimal(30))  # fmt: skip
    ctx = GateContext(Decimal(1_000_000), Decimal("47.4"), Decimal(20_000_000), Decimal(1_000_000), in_cooldown=True)
    verdict = evaluate(order, ctx)
    assert (verdict.verdict, verdict.results[-1].detail_tr) == ("reject", COOLDOWN_TR)
    # the day after the cooldown's last session the symbol is open again
    assert not await cooldown_active(pg, "ORNEK", NOW + timedelta(days=20))


async def test_reset_active_reaches_the_live_desk(pg: DictConn) -> None:
    await pg.execute("UPDATE trading.risk_state SET reset_at = NULL WHERE id = 1")
    off = await live_desk(pg, "ORNEK", NOW, published_at=NOW, available_at=NOW, capital=1_000_000)
    assert not off.reset_active
    await pg.execute("UPDATE trading.risk_state SET reset_at = %s WHERE id = 1", (NOW - timedelta(days=1),))
    on = await live_desk(pg, "ORNEK", NOW, published_at=NOW, available_at=NOW, capital=1_000_000)
    assert on.reset_active
    demo = await desk_for(pg, "ORNEK", now=NOW)
    assert not demo.reset_active  # the demo replay keeps its seeded desk
    live = await desk_for(pg, "ORNEK", live=True, now=NOW)
    assert live.reset_active


async def add_live_run(conn: DictConn, run_id: str, at: datetime, *, outcome: str, r11_reject: bool = False) -> None:
    idx = (await rows(conn, "SELECT disclosure_index FROM core.disclosures ORDER BY disclosure_index LIMIT 1"))[0]
    await conn.execute(
        """
        INSERT INTO trading.agent_runs (run_id, disclosure_index, ticker, company_name, kind, status, outcome, mode,
          run_set, strategy_version, started_at, finished_at, explain)
        VALUES (%s, %s, 'ORNEK', 'ÖRNEK', %s, 'completed', %s, 'paper', 'live', 'v1.1-fwd', %s, %s, '{}')""",
        (run_id, idx["disclosure_index"], "quarantine" if outcome == "QUARANTINED" else "no_trade", outcome, at, at),
    )
    if r11_reject:
        await conn.execute(
            "INSERT INTO trading.risk_checks (run_id, phase, rule_code, outcome, detail) "
            "VALUES (%s, 'pre_trade', 'R11', 'reject', %s)",
            (run_id, Jsonb({"detail_tr": "Şema hatası veya injection bayrağı: ret."})),
        )


async def kill_state(conn: DictConn) -> dict[str, Any]:
    return (await rows(conn, "SELECT kill_switch, kill_by, kill_reason FROM trading.risk_state WHERE id = 1"))[0]


async def test_three_r11_rejects_in_a_day_engage_the_security_kill(pg: DictConn) -> None:
    await pg.execute("UPDATE trading.risk_state SET kill_switch = 'off', reset_started = NULL WHERE id = 1")
    await add_live_run(pg, "run-live-sk1", NOW - timedelta(hours=2), outcome="NO_TRADE", r11_reject=True)
    await add_live_run(pg, "run-live-sk2", NOW - timedelta(hours=1), outcome="QUARANTINED")
    await add_live_run(pg, "run-live-ok", NOW - timedelta(minutes=30), outcome="NO_TRADE")  # no R11 reject
    await add_live_run(pg, "run-live-old", NOW - timedelta(days=1), outcome="QUARANTINED")  # yesterday
    assert await r11_rejected_runs(pg, NOW) == ["run-live-sk1", "run-live-sk2"]
    assert not await check_security_kill(pg, NOW)
    assert (await kill_state(pg))["kill_switch"] == "off"

    await add_live_run(pg, "run-live-sk3", NOW - timedelta(minutes=5), outcome="NO_TRADE", r11_reject=True)
    assert await check_security_kill(pg, NOW)
    state = await kill_state(pg)
    assert (state["kill_switch"], state["kill_by"]) == ("on", SECURITY_MONITOR)
    audit = await rows(
        pg,
        "SELECT actor, payload FROM audit.audit_log WHERE action = 'kill_switch.on' ORDER BY chain_pos DESC LIMIT 1",
    )
    assert audit[0]["actor"] == SECURITY_MONITOR
    assert audit[0]["payload"]["trigger"] == "security"
    assert audit[0]["payload"]["run_ids"] == ["run-live-sk1", "run-live-sk2", "run-live-sk3"]
    assert not await check_security_kill(pg, NOW)  # already on: no second kill

    # the two-key restart lifts it; the day's earlier rejects no longer count after it
    await start_reset(pg, uid="u-admin", name="Yönetici", role="admin", reason="inceleme", now=NOW)
    await confirm_reset(pg, uid="u-risk", role="risk_officer", reason="veri temiz", now=NOW + timedelta(minutes=1),
                        personal=False)  # fmt: skip
    after = NOW + timedelta(minutes=2)
    assert (await kill_state(pg))["kill_switch"] == "off"
    assert await r11_rejected_runs(pg, after) == []
    await add_live_run(pg, "run-live-sk4", after, outcome="QUARANTINED")
    assert await r11_rejected_runs(pg, after + timedelta(minutes=1)) == ["run-live-sk4"]
    assert not await check_security_kill(pg, after + timedelta(minutes=1))


async def test_demo_runs_never_count(pg: DictConn) -> None:
    runs = await r11_rejected_runs(pg, NOW)
    demo = await rows(pg, "SELECT run_id FROM trading.agent_runs WHERE run_set <> 'live' AND outcome = 'QUARANTINED'")
    assert not set(runs) & {r["run_id"] for r in demo}
