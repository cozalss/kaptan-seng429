"""run_regime (06 §9 R10) on stored XU100 closes: a −5 % day turns the desk to crisis at once,
five calm sessions bring it back; risk_state.regime follows and each change is audited."""

from __future__ import annotations

from datetime import date

import pytest

from kaptan.db import DictConn
from kaptan.prices.calendar import add_sessions
from kaptan.risk.regime import run_regime
from tests.integration.test_risk_live_db import rows

pytestmark = pytest.mark.integration

CRASH = date(2026, 9, 16)  # 06 §9: XU100 closed −5.54 % that day


async def _bar(conn: DictConn, d: date, close: float) -> None:
    await conn.execute(
        "INSERT INTO core.prices_daily (ticker, d, open, close, source, price_basis) "
        "VALUES ('XU100', %s, %s, %s, 'yfinance', 'adjusted') "
        "ON CONFLICT (ticker, d, source) DO UPDATE SET close = EXCLUDED.close",
        (d, close, close),
    )


async def test_crash_day_then_five_calm_sessions(pg: DictConn) -> None:
    await pg.execute("DELETE FROM trading.regime_daily")
    await pg.execute("UPDATE trading.risk_state SET regime = 'normal'")
    for i in range(60, 0, -1):
        await _bar(pg, add_sessions(CRASH, -i), 10_000.0 + (i % 3))
    await _bar(pg, CRASH, 10_000.0 * (1 - 0.0554))

    crisis = await run_regime(pg, CRASH, demo=False)
    assert crisis is not None and crisis.signal.crisis_raw and crisis.changed
    assert (crisis.regime, crisis.calm_streak) == ("crisis", 0)
    assert (await rows(pg, "SELECT regime FROM trading.risk_state"))[0]["regime"] == "crisis"
    (audit,) = await rows(pg, "SELECT action, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1")
    assert audit["action"] == "risk.regime_changed" and audit["payload"]["to"] == "crisis"

    d = CRASH
    for n in range(1, 6):
        d = add_sessions(d, 1)
        await _bar(pg, d, 9_446.0 + n)
        result = await run_regime(pg, d, demo=False)
        assert result is not None and not result.signal.crisis_raw
        assert (result.regime, result.calm_streak) == ("crisis" if n < 5 else "normal", n)
    assert (await rows(pg, "SELECT regime FROM trading.risk_state"))[0]["regime"] == "normal"
    stored = await rows(pg, "SELECT d, regime, calm_streak FROM trading.regime_daily ORDER BY d")
    assert [s["regime"] for s in stored] == ["crisis"] * 5 + ["normal"]

    assert await run_regime(pg, add_sessions(d, 1), demo=False) is None  # no close stored yet
    assert await run_regime(pg, date(2026, 9, 19), demo=False) is None  # Saturday
    assert await run_regime(pg, d, demo=True) is None  # the demo keeps its seeded regime
