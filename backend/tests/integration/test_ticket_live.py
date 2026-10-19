"""Tickets for live approvals (M3 A3, FR-27, 12 §2): outside DEMO_MODE every approved buy gets its ticket,
sized for the configured personal account; in DEMO_MODE the demo-day gate stays."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from kaptan.brokers import config as bc
from kaptan.brokers.config import ExecConfig
from kaptan.db import DictConn
from kaptan.domain.schemas.trading import OrderTicket
from tests.integration.test_fill_engine import KRGCL, approve, desk, history, one

pytestmark = pytest.mark.integration
__all__ = ["desk"]

#: Before the demo day: in DEMO_MODE no ticket would be printed for this approval.
BEFORE_DEMO_DAY = datetime(2027, 1, 8, 11, 0, tzinfo=UTC)


async def test_live_approval_before_the_demo_day_gets_a_ticket_for_the_configured_account(desk: DictConn) -> None:
    bc.install(ExecConfig(demo_mode=False, personal_account_try=Decimal(500_000)))
    await desk.execute("UPDATE trading.live_arm SET config_live = true, env_enabled = false, ui_key = false")
    await history(desk, "KRGCL", datetime(2027, 1, 7).date())
    outcome = await approve(desk, KRGCL, BEFORE_DEMO_DAY)
    tickets = [data for event, data in outcome.events if event == "ticket"]
    assert len(tickets) == 1
    ticket = OrderTicket.model_validate(tickets[0]).model_dump(mode="json")
    assert ticket["account_equity_try"] == 500_000
    assert ticket["mode_keys"] == {"config": True, "env": False, "ui": False}
    last = await one(
        desk, "SELECT equity FROM trading.pnl_daily WHERE strategy = 'kaptan:v1.1-fwd' ORDER BY ord DESC LIMIT 1"
    )
    assert last is not None
    expected = max(1, int((50_542 * 500_000 / float(last["equity"])) // 34.15))
    assert ticket["qty"] == expected
    assert ticket["ticket_no"].startswith("T-2027-0108-")


async def test_demo_mode_keeps_the_demo_day_gate(desk: DictConn) -> None:
    bc.install(ExecConfig(demo_mode=True))
    outcome = await approve(desk, KRGCL, BEFORE_DEMO_DAY)
    assert [event for event, _ in outcome.events] == ["approval.decided", "order"]
