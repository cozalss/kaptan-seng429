"""FR-33: the gate reads the active limit version; a signed change takes effect on the next run.
A retired stop limit left in an old version is not shown."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from kaptan.db import DictConn
from kaptan.domain.schemas import LimitDecisionInput, LimitProposalInput
from kaptan.risk import limits
from kaptan.risk.active_limits import active_limits
from kaptan.risk.gate import GateLimits
from tests.harness.replay import ReplayProvider, ReplayToolbox
from tests.harness.scenario import build_context, recorded_run

pytestmark = pytest.mark.integration

NOW = datetime(2027, 1, 11, 10, 40, tzinfo=UTC)


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


async def test_a_retired_stop_limit_in_an_old_version_is_not_shown(pg: DictConn) -> None:
    await pg.execute("INSERT INTO trading.limits (version, key, value, ord) VALUES (1, 'kill_drawdown_pct', -0.05, 99)")
    from kaptan.risk.limits import limits_view

    view = await limits_view(pg)
    assert "kill_drawdown_pct" not in [v["key"] for v in view["active"]["values"]]
