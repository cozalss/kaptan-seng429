"""The in-session risk monitor on Postgres: −1 % daily halt, −5 % drawdown kill switch (audited, SSE),
the halt lifted at the next session, the post-restart rule, and nothing at all in DEMO_MODE.
The monitor commits, so each test reseeds the demo day afterwards."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from redis.asyncio import Redis

from kaptan.db import DictConn, connect
from kaptan.events import bus
from kaptan.risk.monitor import run_risk_monitor
from kaptan.settings import Settings
from tests.conftest import reseed_test_db
from tests.integration.test_risk_live_db import CAPITAL, NOW, add_pnl, clean_book, one_position_desk, rows

pytestmark = pytest.mark.integration


@pytest.fixture
async def app_conn(migrated: Settings, seeded: Any) -> AsyncIterator[DictConn]:
    conn = await connect(migrated.database_url.get_secret_value())
    try:
        yield conn
    finally:
        await conn.rollback()
        await conn.close()
        await reseed_test_db(migrated)


async def _state(conn: DictConn) -> dict[str, Any]:
    out = (
        await rows(
            conn,
            "SELECT kill_switch, kill_by, halted_today, halted_on, daily_pnl_pct, drawdown_pct, reset_equity "
            "FROM trading.risk_state WHERE id = 1",
        )
    )[0]
    await conn.commit()
    return out


async def _audit(conn: DictConn, n: int) -> list[dict[str, Any]]:
    out = await rows(conn, "SELECT actor, action, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT %s", (n,))
    await conn.commit()
    return list(reversed(out))


async def _reset_flags(conn: DictConn) -> None:
    await conn.execute(
        "UPDATE trading.risk_state SET kill_switch = 'off', kill_reason = NULL, kill_at = NULL, kill_by = NULL, "
        "reset_started = NULL, halted_today = false, halted_on = NULL, daily_pnl_pct = 0, drawdown_pct = 0"
    )


async def test_demo_mode_does_nothing(app_conn: DictConn) -> None:
    result = await run_risk_monitor(app_conn, NOW, demo=True)
    assert not result.ran and result.events == ()


async def test_halt_then_kill_switch(app_conn: DictConn, migrated: Settings) -> None:
    await one_position_desk(app_conn)  # equity 1 001 973.75, day start 1 010 000 (−0.79 %)
    await _reset_flags(app_conn)
    await app_conn.commit()

    calm = await run_risk_monitor(app_conn, NOW, capital=CAPITAL, demo=False)
    assert calm.ran and calm.events == () and not calm.halted
    state = await _state(app_conn)
    assert state["daily_pnl_pct"] == pytest.approx(-0.00795, abs=1e-5) and not state["halted_today"]
    assert calm.status is not None and calm.status["equity"] == 1_001_974

    # a deeper day start: −1.6 % today → the daily halt
    await app_conn.execute(
        "UPDATE trading.pnl_daily SET equity = 1018500, peak_equity = 1018500 WHERE d = %s", (date(2026, 10, 19),)
    )
    await app_conn.commit()
    redis = Redis.from_url(migrated.redis_url.get_secret_value())
    try:
        before = await redis.xrevrange(bus.stream_key("desk"), count=1)
        halt = await run_risk_monitor(app_conn, NOW, redis=redis, capital=CAPITAL, demo=False)
        assert halt.halted and halt.events == ("halt",) and not halt.killed
        after = await redis.xrevrange(bus.stream_key("desk"), count=1)
        assert after and after != before
    finally:
        await redis.aclose()
    state = await _state(app_conn)
    assert state["halted_today"] and state["halted_on"] == date(2026, 10, 20)
    (entry,) = await _audit(app_conn, 1)
    assert (entry["actor"], entry["action"]) == ("system:risk_monitor", "risk.halted")
    assert entry["payload"]["daily_pnl_pct"] == pytest.approx(1_001_973.75 / 1_018_500 - 1, abs=1e-5)
    assert entry["payload"]["limits_version"] == 1
    again = await run_risk_monitor(app_conn, NOW + timedelta(minutes=5), capital=CAPITAL, demo=False)
    assert not again.halted  # once per day

    # the peak far above: −6 % from it → kill switch, the open ORNCM order cancelled
    await app_conn.execute("UPDATE trading.pnl_daily SET peak_equity = 1066000 WHERE d = %s", (date(2026, 10, 19),))
    await app_conn.commit()
    kill = await run_risk_monitor(app_conn, NOW + timedelta(minutes=10), capital=CAPITAL, demo=False)
    assert kill.killed and kill.events == ("kill_switch",)
    state = await _state(app_conn)
    assert (state["kill_switch"], state["kill_by"]) == ("on", "system:risk_monitor")
    (entry,) = await _audit(app_conn, 1)
    assert entry["action"] == "kill_switch.on"
    assert entry["payload"]["reason"] == "Zirveden −%5 düşüş (R01)"
    assert entry["payload"]["canceled_orders"] == 1 and entry["payload"]["peak_equity"] == 1_066_000
    canceled = await rows(app_conn, "SELECT status, cancel_reason FROM trading.orders WHERE id = 'o-orncm'")
    assert canceled == [{"status": "canceled", "cancel_reason": "kill_switch"}]
    await app_conn.commit()

    # next session (after pnl_eod wrote today's close): the halt lifts by itself, the kill switch does not
    await add_pnl(app_conn, date(2026, 10, 20), 1_001_973.75, 1_066_000)
    await app_conn.commit()
    tomorrow = await run_risk_monitor(app_conn, NOW + timedelta(days=1), capital=CAPITAL, demo=False)
    assert tomorrow.halt_cleared and not tomorrow.killed
    state = await _state(app_conn)
    assert not state["halted_today"] and state["kill_switch"] == "on"
    assert (await _audit(app_conn, 1))[0]["action"] == "risk.halt_cleared"


async def test_after_a_restart_the_floor_holds_until_three_percent_more(app_conn: DictConn) -> None:
    await clean_book(app_conn)
    await _reset_flags(app_conn)
    await add_pnl(app_conn, date(2026, 10, 19), 1_000_000, 1_060_000)  # −5.7 % from the peak, flat today
    await app_conn.execute("UPDATE trading.risk_state SET reset_at = %s", (NOW - timedelta(hours=1),))
    await app_conn.commit()
    held = await run_risk_monitor(app_conn, NOW, capital=CAPITAL, demo=False)
    assert not held.killed and float(held.drawdown_pct) == pytest.approx(-0.049)
    assert (await _state(app_conn))["reset_equity"] == CAPITAL
    # a further −3 % below the reset level (cash out of the desk = a loss): real drawdown → kill again
    await app_conn.execute("UPDATE trading.risk_state SET reset_equity = 1032000")
    await app_conn.commit()
    killed = await run_risk_monitor(app_conn, NOW + timedelta(minutes=5), capital=CAPITAL, demo=False)
    assert killed.killed and killed.drawdown_pct < -0.05


async def test_a_fresh_database_gets_its_risk_state_row(app_conn: DictConn) -> None:
    await app_conn.execute("DELETE FROM trading.risk_state")
    await clean_book(app_conn)
    await app_conn.commit()
    result = await run_risk_monitor(app_conn, datetime(2026, 10, 20, 9, 0, tzinfo=UTC), capital=CAPITAL, demo=False)
    assert result.ran and result.equity == CAPITAL
    assert (await _state(app_conn))["kill_switch"] == "off"
