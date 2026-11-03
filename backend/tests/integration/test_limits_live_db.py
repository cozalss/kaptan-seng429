"""FR-33: the gate reads the active limit version; a signed change takes effect on the next run.
Also the restart rule (06 §11, FR-20 Rev 2) on the real kill-switch functions."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest

from kaptan.api.errors import ApiError
from kaptan.db import DictConn
from kaptan.domain.schemas import LimitDecisionInput, LimitProposalInput, RiskStatus
from kaptan.risk import kill_switch as ks
from kaptan.risk import limits
from kaptan.risk.active_limits import active_limits
from kaptan.risk.gate import GateLimits
from kaptan.risk.status import risk_status
from tests.harness.replay import ReplayProvider, ReplayToolbox
from tests.harness.scenario import build_context, recorded_run

pytestmark = pytest.mark.integration

NOW = datetime(2027, 1, 11, 10, 40, tzinfo=UTC)
#: Mon 11 Jan 2027 + 5 sessions (Tue 12 … Mon 18), 10:00 Istanbul.
OPENS_AT = datetime(2027, 1, 18, 7, 0, tzinfo=UTC)


async def test_seeded_v1_is_the_canonical_default(pg: DictConn) -> None:
    active = await active_limits(pg)
    assert active.version == 1 and active.limits == GateLimits()


async def test_a_signed_change_reaches_the_next_run(pg: DictConn) -> None:
    run = await recorded_run(pg, "e3_contract")
    before, _doc, _texts = await build_context(pg, run, NOW, provider=ReplayProvider(), tools=ReplayToolbox())
    assert (before.limits_version, before.limits.max_position_pct) == (1, Decimal("0.1"))

    body = LimitProposalInput(key="max_position_pct", value=0.08, reason="Pozisyon tavanını sıkılaştır.")
    version = await limits.propose(pg, body, uid="sahip", name="Sahip", role="risk_officer", now=NOW)
    pending, _d, _t = await build_context(pg, run, NOW, provider=ReplayProvider(), tools=ReplayToolbox())
    assert pending.limits_version == 1  # the proposal alone changes nothing
    await limits.decide(
        pg, version, LimitDecisionInput(decision="approve"), uid="sahip", name="Sahip", role="risk_officer", now=NOW
    )
    after, _d, _t = await build_context(pg, run, NOW, provider=ReplayProvider(), tools=ReplayToolbox())
    assert after.limits_version == version
    assert after.limits.max_position_pct == Decimal("0.08")
    assert after.limits.risk_tolerance == Decimal("1.05")  # not in the panel's set: the documented default


async def test_no_active_version_falls_back_to_the_defaults(pg: DictConn) -> None:
    await pg.execute("UPDATE trading.limit_versions SET status = 'superseded' WHERE status = 'active'")
    active = await active_limits(pg)
    assert active.version is None and active.limits == GateLimits()


async def _stopped_and_requested(pg: DictConn, kill_at: datetime, started: datetime) -> None:
    await pg.execute("UPDATE trading.risk_state SET kill_switch = 'off', reset_started = NULL")
    await ks.engage(pg, by="user:sahip", reason="test", role="risk_officer", now=kill_at)
    await ks.start_reset(pg, uid="sahip", name="Sahip", role="risk_officer", reason="Olay incelendi.", now=started)


async def _last_actions(pg: DictConn, n: int) -> list[tuple[str, dict[str, Any]]]:
    async with pg.cursor() as cur:
        await cur.execute("SELECT action, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT %s", (n,))
        rows = await cur.fetchall()
    return [(r["action"], r["payload"]) for r in reversed(rows)]


async def test_with_real_data_the_restart_waits_24h_and_5_sessions(pg: DictConn) -> None:
    kill_at = datetime(2026, 10, 12, 9, 0, tzinfo=UTC)  # Monday
    started = datetime(2026, 10, 18, 9, 0, tzinfo=UTC)
    await _stopped_and_requested(pg, kill_at, started)
    with pytest.raises(ApiError) as early:
        await ks.confirm_reset(pg, uid="sahip", role="risk_officer", reason="Onay.", now=started + timedelta(hours=2))
    assert (early.value.status, early.value.code) == (409, "conflict")
    assert "19.10.2026 12:00" in early.value.detail
    await ks.confirm_reset(pg, uid="sahip", role="risk_officer", reason="Onay.", now=started + timedelta(hours=25))
    async with pg.cursor() as cur:
        await cur.execute("SELECT kill_switch, reset_at FROM trading.risk_state")
        row = await cur.fetchone()
    assert row is not None and row["kill_switch"] == "off" and row["reset_at"] == started + timedelta(hours=25)
    assert [a for a, _ in await _last_actions(pg, 3)] == [
        "kill_switch.reset_started",
        "auth.single_user_waiver",
        "kill_switch.reset",
    ]


async def test_nobody_waiving_the_wait_means_the_wait_applies(pg: DictConn) -> None:
    await _stopped_and_requested(pg, NOW, NOW)
    with pytest.raises(ApiError) as early:
        await ks.confirm_reset(pg, uid="sahip", role="risk_officer", reason="Onay.", now=NOW)
    assert early.value.status == 409


async def test_status_carries_ready_at_until_the_wait_is_over(pg: DictConn) -> None:
    await _stopped_and_requested(pg, NOW, NOW)
    live = await risk_status(pg, NOW + timedelta(hours=1), capital=1_000_000.0)
    assert live["reset"]["ready_at"] == OPENS_AT
    assert RiskStatus.model_validate(live).model_dump(mode="json")["reset"]["ready_at"] == "2027-01-18T07:00:00.000Z"
    opened = await risk_status(pg, OPENS_AT, capital=1_000_000.0)
    assert opened["reset"]["ready_at"] is None
