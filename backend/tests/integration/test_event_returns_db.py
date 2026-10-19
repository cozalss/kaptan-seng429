"""event_returns on Postgres: materialised CARs equal the study's, PIT read, holdout view, dev_ro grants."""

from __future__ import annotations

import pytest

from kaptan.db import DictConn
from kaptan.evidence.repo import materialised_cars, past_events
from kaptan.evidence.service import study_events
from kaptan.prices.calendar import close_known_at
from kaptan.reference.event_returns import run_event_returns
from tests.integration.test_evidence_db import ARS, AS_OF, DAYS, SELF_INDEX, world  # noqa: F401 (fixture)

pytestmark = pytest.mark.integration


async def test_materialise_then_read_back(world: DictConn) -> None:  # noqa: F811
    stats = await run_event_returns(world, DAYS[340])
    assert stats.new_events == 5 and stats.rows >= 15  # 1/5/20 matured for all 5; 60 for some
    again = await run_event_returns(world, DAYS[340])
    assert again.new_events == 0 and again.rows == 0
    async with world.cursor() as cur:
        await cur.execute("SELECT t_end, available_at FROM core.event_returns")
        for r in await cur.fetchall():
            assert r["available_at"] == close_known_at(r["t_end"])
    events = await past_events(world, "E3", AS_OF, SELF_INDEX, ticker="TSTAA")
    pre = await materialised_cars(world, events, (1, 5, 20), AS_OF)
    assert len(pre) == 5
    computed = await study_events(world, events, AS_OF)  # uses the materialised rows
    for r in computed.results:
        idx = DAYS.index(r.t0) - 1
        assert r.cars == {h: pytest.approx(ARS[idx], abs=1e-6) for h in (1, 5, 20)}
    # point in time: before the 20-day windows closed nothing complete is returned for them
    assert await materialised_cars(world, events, (1, 5, 20), close_known_at(DAYS[257])) == {}


async def test_holdout_view_and_dev_ro(owner_pg: DictConn) -> None:
    async with owner_pg.cursor() as cur:
        await cur.execute("SELECT has_table_privilege('dev_ro', 'core.event_returns', 'SELECT') AS raw,"
                          " has_table_privilege('dev_ro', 'core.event_returns_dev', 'SELECT') AS dev")  # fmt: skip
        assert await cur.fetchone() == {"raw": False, "dev": True}
        await cur.execute("SELECT pg_get_viewdef('core.event_returns_dev') AS v")
        assert "2024-12-31 21:00:00+00" in (await cur.fetchone())["v"]  # 2025-01-01 00:00 Istanbul
