"""Durable demo fills (M3 A3): a restart dropped the 1.8 s timer; startup settles the fill, once."""

from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace

import pytest

from kaptan.approvals.execute import resume_pending_fills, wait_for_fills
from kaptan.clock import Clock
from kaptan.db import create_pool
from kaptan.demo.seed import SeedResult
from kaptan.settings import Settings
from tests.conftest import reseed_test_db
from tests.integration.a_support import fresh, sql

pytestmark = pytest.mark.integration
__all__ = ["fresh"]


async def test_pending_demo_fill_is_settled_after_a_restart(fresh: SeedResult, migrated: Settings) -> None:
    clock = Clock(demo=True, started_at=fresh.started_at)
    created = clock.now() - timedelta(seconds=10)
    await sql(
        migrated,
        """INSERT INTO trading.orders (id, client_order_id, proposal_id, run_id, ticker, company_name, side, order_type,
             tif, qty, limit_price, status, broker, is_fixture, created_at)
           VALUES ('ord-s-day-e1-krgcl', 'kaptan-ord-s-day-e1-krgcl', 'prop-day-e1-krgcl', 'run-day-e1-krgcl', 'KRGCL',
             'KORU', 'buy', 'limit', 'day', 100, 34.15, 'accepted', 'simbist', false, %s)""",
        (created,),
    )
    pool = create_pool(migrated.database_url.get_secret_value(), min_size=1, max_size=2)
    await pool.open()
    app = SimpleNamespace(state=SimpleNamespace(pool=pool, clock=clock, redis=None))
    try:
        assert await resume_pending_fills(app) == 1
        await wait_for_fills()
        assert await resume_pending_fills(app) == 0  # filled: nothing left to resume
        fills = await sql(migrated, "SELECT price, qty FROM trading.fills WHERE order_id = 'ord-s-day-e1-krgcl'")
        assert fills == [{"price": 33.98, "qty": 100}]  # limit × 0.995, as the timer would have
        status = await sql(migrated, "SELECT status, filled_by FROM trading.orders WHERE id = 'ord-s-day-e1-krgcl'")
        assert status == [{"status": "filled", "filled_by": "demo_timer"}]
    finally:
        await pool.close()
        await reseed_test_db(migrated)
