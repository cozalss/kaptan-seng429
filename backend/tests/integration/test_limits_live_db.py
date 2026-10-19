"""FR-33: the gate reads the active limit version; a four-eyes change takes effect on the next run.
Also the personal-mode restart rule (06 §11, FR-20 Rev 2) on the real kill-switch functions."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from kaptan.agents import db as q
from kaptan.agents.scenario import build_context
from kaptan.agents.tools import ReplayToolbox
from kaptan.api.errors import ApiError
from kaptan.db import DictConn
from kaptan.domain.schemas import LimitDecisionInput, LimitProposalInput
from kaptan.llm.replay import ReplayProvider
from kaptan.risk import kill_switch as ks
from kaptan.risk import limits
from kaptan.risk.active_limits import active_limits
from kaptan.risk.gate import GateLimits

pytestmark = pytest.mark.integration

NOW = datetime(2027, 1, 11, 10, 40, tzinfo=UTC)


async def test_seeded_v1_is_the_canonical_default(pg: DictConn) -> None:
    active = await active_limits(pg)
    assert active.version == 1 and active.limits == GateLimits()


async def test_a_signed_change_reaches_the_next_run(pg: DictConn) -> None:
    run = await q.demo_run(pg, "e3_contract")
    before, _doc, _texts = await build_context(pg, run, NOW, provider=ReplayProvider(), tools=ReplayToolbox())
    assert (before.limits_version, before.limits.max_position_pct) == (1, Decimal("0.1"))

    body = LimitProposalInput(key="max_position_pct", value=0.08, reason="Pozisyon tavanını sıkılaştır.")
    version = await limits.propose(pg, body, uid="uye-1", name="Üye 1", role="admin", now=NOW)
    pending, _d, _t = await build_context(pg, run, NOW, provider=ReplayProvider(), tools=ReplayToolbox())
    assert pending.limits_version == 1  # one signature is not enough
    await limits.decide(
        pg, version, LimitDecisionInput(decision="approve"), uid="uye-3", name="Üye 3", role="risk_officer", now=NOW
    )
    after, _d, _t = await build_context(pg, run, NOW, provider=ReplayProvider(), tools=ReplayToolbox())
    assert after.limits_version == version
    assert after.limits.max_position_pct == Decimal("0.08")
    assert after.limits.risk_tolerance == Decimal("1.05")  # not in the panel's set: the documented default


async def test_no_active_version_falls_back_to_the_defaults(pg: DictConn) -> None:
    await pg.execute("UPDATE trading.limit_versions SET status = 'superseded' WHERE status = 'active'")
    active = await active_limits(pg)
    assert active.version is None and active.limits == GateLimits()


async def test_personal_mode_restart_waits_24h_and_5_sessions(pg: DictConn) -> None:
    await pg.execute("UPDATE trading.risk_state SET kill_switch = 'off', reset_started = NULL")
    kill_at = datetime(2026, 10, 12, 9, 0, tzinfo=UTC)  # Monday
    await ks.engage(pg, by="user:uye-3", reason="test", role="risk_officer", now=kill_at)
    started = datetime(2026, 10, 18, 9, 0, tzinfo=UTC)
    await ks.start_reset(pg, uid="uye-1", name="Üye 1", role="admin", reason="Olay incelendi.", now=started)
    with pytest.raises(ApiError) as early:
        await ks.confirm_reset(
            pg, uid="uye-3", role="risk_officer", reason="Onay.", now=started + timedelta(hours=2), personal=True
        )
    assert (early.value.status, early.value.code) == (409, "conflict")
    await ks.confirm_reset(
        pg, uid="uye-3", role="risk_officer", reason="Onay.", now=started + timedelta(hours=25), personal=True
    )
    async with pg.cursor() as cur:
        await cur.execute("SELECT kill_switch, reset_at FROM trading.risk_state")
        row = await cur.fetchone()
    assert row is not None and row["kill_switch"] == "off" and row["reset_at"] == started + timedelta(hours=25)


async def test_paper_mode_restart_has_no_waiting_period(pg: DictConn) -> None:
    await pg.execute("UPDATE trading.risk_state SET kill_switch = 'off', reset_started = NULL")
    await ks.engage(pg, by="user:uye-3", reason="test", role="risk_officer", now=NOW)
    await ks.start_reset(pg, uid="uye-1", name="Üye 1", role="admin", reason="Olay incelendi.", now=NOW)
    await ks.confirm_reset(pg, uid="uye-3", role="risk_officer", reason="Onay.", now=NOW, personal=False)
