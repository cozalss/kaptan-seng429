"""M4 package R against the DB: the P8 cooldown reaches the agent's desk and the gate."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest

from kaptan.agents.feed_run import desk_for
from kaptan.db import DictConn
from kaptan.risk.cooldown import cooldown_active
from kaptan.risk.gate import COOLDOWN_TR, GateContext, GateOrder, evaluate

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
    order = GateOrder("ORNEK", "E1", 1000, Decimal("47.4"), Decimal("0.08"),
                      evidence_ids=("a",) * 5, retrieved_ids=("a",), expected_edge_bps=Decimal(70),
                      est_cost_bps=Decimal(30), reader_amount=Decimal(10**7),
                      regex_amounts=(Decimal(10**7),))  # fmt: skip
    ctx = GateContext(Decimal(1_000_000), Decimal("47.4"), Decimal(20_000_000), Decimal(1_000_000), in_cooldown=True)
    verdict = evaluate(order, ctx)
    assert (verdict.verdict, verdict.results[-1].detail_tr) == ("reject", COOLDOWN_TR)
    # the day after the cooldown's last session the symbol is open again
    assert not await cooldown_active(pg, "ORNEK", NOW + timedelta(days=20))
