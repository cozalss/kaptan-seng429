"""Shadow returns of rejected / expired signals (M3 A3, FR-43, 08 §4), on one rolled-back connection."""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from kaptan.db import DictConn
from kaptan.portfolio.shadow import run_shadow_returns
from kaptan.prices.calendar import add_sessions
from tests.integration.test_fill_engine import KRGCL, bar, desk, one

pytestmark = pytest.mark.integration
__all__ = ["desk"]

TUE, WED = date(2027, 1, 12), date(2027, 1, 13)


async def test_expired_and_rejected_signals_get_their_shadow_returns(desk: DictConn) -> None:
    # The KRGCL card lapses unsigned on Tuesday 09:50; another one is rejected by the Risk Sorumlusu.
    other = await one(
        desk,
        "SELECT proposal_id FROM trading.approvals WHERE status = 'pending' AND proposal_id <> %s "
        "ORDER BY proposal_id LIMIT 1",
        (KRGCL,),
    )
    assert other is not None
    await desk.execute(
        "UPDATE trading.approvals SET status = 'rejected', decided_by = 'uye-3', decided_at = %s "
        "WHERE proposal_id = %s",
        (datetime(2027, 1, 11, 11, 0, tzinfo=UTC), other["proposal_id"]),
    )
    report = await run_shadow_returns(desk, TUE)
    assert report.collected >= 2 and report.updated == []
    krgcl = await one(desk, "SELECT * FROM trading.shadow_signals WHERE signal_id = %s", (f"sh-{KRGCL}",))
    assert krgcl is not None
    assert (krgcl["reason_code"], krgcl["reason_source"], krgcl["entry_day"]) == ("APPROVAL_EXPIRED", "expired", WED)
    rejected = await one(
        desk,
        "SELECT reason_code, entry_day FROM trading.shadow_signals WHERE proposal_id = %s",
        (other["proposal_id"],),
    )
    assert rejected == {"reason_code": "RO_REJECTED", "entry_day": TUE}
    # 20 sessions later: open(entry) → close(entry + 19), and the excess over XU100.
    exit_day = add_sessions(WED, 19)
    for ticker, (o, c) in {"KRGCL": (10.0, 11.0), "XU100": (100.0, 105.0)}.items():
        await bar(desk, ticker, WED, open_=o, close=o)
        await bar(desk, ticker, add_sessions(WED, 4), close=o * 1.02)
        await bar(desk, ticker, exit_day, close=c)
    report = await run_shadow_returns(desk, exit_day)
    assert f"sh-{KRGCL}" in report.updated
    row = await one(desk, "SELECT * FROM trading.shadow_signals WHERE signal_id = %s", (f"sh-{KRGCL}",))
    assert row is not None
    assert row["return_20d"] == pytest.approx(0.10) and row["excess_20d"] == pytest.approx(0.05)
    assert row["return_5d"] == pytest.approx(0.02) and row["excess_5d"] == pytest.approx(0.0)
    again = await run_shadow_returns(desk, exit_day)
    assert f"sh-{KRGCL}" not in again.updated  # written once


async def test_a_gate_rejected_run_is_a_shadow_signal(desk: DictConn) -> None:
    run = await one(
        desk,
        "SELECT run_id FROM trading.agent_runs r WHERE kind = 'no_trade' AND event_type IN ('E1', 'E2', 'E3', 'E4') "
        "AND NOT EXISTS (SELECT 1 FROM trading.approvals a WHERE a.run_id = r.run_id) ORDER BY run_id LIMIT 1",
    )
    assert run is not None
    assert await one(desk, "SELECT 1 FROM trading.shadow_signals WHERE run_id = %s", (run["run_id"],)) is None
    await desk.execute(
        """UPDATE trading.agent_runs SET explain = jsonb_set(explain, '{risk_checks}',
             '[{"rule_code": "R08", "outcome": "reject"}]'::jsonb) WHERE run_id = %s""",
        (run["run_id"],),
    )
    await run_shadow_returns(desk, TUE)
    row = await one(desk, "SELECT reason_code, reason_source FROM trading.shadow_signals WHERE signal_id = %s",
                    (f"sh-{run['run_id']}",))  # fmt: skip
    assert row == {"reason_code": "R08", "reason_source": "risk_gate"}
