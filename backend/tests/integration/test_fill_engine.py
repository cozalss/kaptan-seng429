"""SimBIST outside DEMO_MODE (M3 A3, FR-26): an approval books a next-open order; `run_open_fill` fills it at
the raw open + slippage + commission, or misses it (above the limit, tavan, no price); intraday orders fill
at the next available price (`run_eod_fills`). Everything runs on one rolled-back connection.

The helpers here (`desk`, `history`, `approve`, …) are shared with the exit / shadow / ticket tests.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest

from kaptan.api.deps import Actor
from kaptan.approvals import service
from kaptan.approvals.execute import execute_approved
from kaptan.brokers import config as bc
from kaptan.brokers.config import ExecConfig
from kaptan.brokers.fills import run_eod_fills, run_open_fill
from kaptan.db import DictConn
from kaptan.domain.schemas import ApprovalDecision
from kaptan.prices.calendar import add_sessions, prev_session

pytestmark = pytest.mark.integration

KRGCL = "prop-day-e1-krgcl"
KRGCL_ORDER = "ord-s-day-e1-krgcl"
MON, TUE, WED = date(2027, 1, 11), date(2027, 1, 12), date(2027, 1, 13)
#: Monday 14:00 Istanbul: the KRGCL card (next-open, limit 34.15) is still pending.
DECIDE_AT = datetime(2027, 1, 11, 11, 0, tzinfo=UTC)
RISK_OFFICER = Actor(uid="uye-3", name="Risk Sorumlusu", role="risk_officer", family="t")
APPROVE = ApprovalDecision(decision="approve", approved_notional_try=None, comment="")


@pytest.fixture
async def desk(pg: DictConn) -> AsyncIterator[DictConn]:
    """The seeded day, DEMO_MODE off for the order path, one transaction that is rolled back afterwards."""
    await pg.execute("SELECT 1")  # open the transaction: every `conn.transaction()` below is a savepoint
    bc.install(ExecConfig(demo_mode=False))
    try:
        yield pg
    finally:
        bc.reset()


async def bar(
    conn: DictConn, ticker: str, d: date, *, close: float, open_: float | None = None, high: float | None = None,
    low: float | None = None, volume: float = 1_000_000,
) -> None:  # fmt: skip
    """One raw İş Yatırım bar (replaces an existing one)."""
    o = open_ if open_ is not None else close
    await conn.execute(
        """
        INSERT INTO core.prices_daily (ticker, d, open, high, low, close, volume, price_basis, source)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'raw', 'isyatirim')
        ON CONFLICT (ticker, d, source) DO UPDATE SET open = EXCLUDED.open, high = EXCLUDED.high,
          low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume""",
        (ticker, d, o, high or max(o, close), low or min(o, close), close, volume),
    )


async def history(conn: DictConn, ticker: str, last: date, *, close: float = 33.48, n: int = 21) -> None:
    """`n` flat sessions ending at `last` (zero spread and volatility: slippage is the 5 bps floor)."""
    d = last
    for _ in range(n):
        await bar(conn, ticker, d, close=close)
        d = prev_session(d)


async def approve(conn: DictConn, proposal_id: str, now: datetime) -> service.Outcome:
    return await service.decide(conn, proposal_id, APPROVE, RISK_OFFICER, now=now, wall=now)


async def one(conn: DictConn, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        row = await cur.fetchone()
    return None if row is None else dict(row)


async def last_audit(conn: DictConn) -> dict[str, Any]:
    row = await one(conn, "SELECT actor, action, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1")
    assert row is not None
    return row


async def order(conn: DictConn, order_id: str = KRGCL_ORDER) -> dict[str, Any]:
    row = await one(conn, "SELECT * FROM trading.orders WHERE id = %s", (order_id,))
    assert row is not None
    return row


async def approved_krgcl(conn: DictConn) -> service.Outcome:
    await history(conn, "KRGCL", MON)
    outcome = await approve(conn, KRGCL, DECIDE_AT)
    assert outcome.fill is None  # no demo timer outside DEMO_MODE
    return outcome


async def test_next_open_order_fills_at_the_raw_open_with_costs(desk: DictConn) -> None:
    outcome = await approved_krgcl(desk)
    names = [e for e, _ in outcome.events]
    assert names == ["approval.decided", "ticket", "order"]
    o = await order(desk)
    assert (o["status"], o["tif"], o["qty"]) == ("pending_open", "opg", 1480)
    assert (await run_open_fill(desk, MON)).fills == []  # its auction is Tuesday's
    await bar(desk, "KRGCL", TUE, open_=33.90, close=34.10)
    report = await run_open_fill(desk, TUE)
    assert [f["order_id"] for f in report.fills] == [KRGCL_ORDER]
    fill = await one(desk, "SELECT * FROM trading.fills WHERE order_id = %s", (KRGCL_ORDER,))
    assert fill is not None
    assert (fill["price"], fill["slippage_bps"], fill["commission"], fill["bsmv"]) == (33.92, 5.9, 26.38, 1.26)
    assert fill["filled_at"] == datetime(2027, 1, 12, 7, 0, tzinfo=UTC)  # 10:00 Istanbul
    o = await order(desk)
    assert (o["status"], o["filled_by"]) == ("filled", "open_fill")
    pos = await one(desk, "SELECT qty, avg_cost, stop_price, stop_pct FROM trading.positions WHERE book = 'paper' "
                    "AND source_proposal = %s", (KRGCL,))  # fmt: skip
    assert pos is not None and (pos["qty"], pos["avg_cost"], pos["stop_price"]) == (1480, 33.92, 30.97)
    audit = await last_audit(desk)
    assert (audit["actor"], audit["action"], audit["payload"]["price"]) == ("system:simbist", "order.filled", 33.92)
    assert (await run_open_fill(desk, TUE)).fills == []  # idempotent


@pytest.mark.parametrize(
    ("open_", "status", "cancel", "miss"),
    [
        (34.20, "canceled", "day_end", "open_above_limit"),
        (36.82, "canceled", "limit_up_open", "limit_up_open"),
    ],
)
async def test_missed_at_the_open_is_not_retried(
    desk: DictConn, open_: float, status: str, cancel: str, miss: str
) -> None:
    await approved_krgcl(desk)
    await bar(desk, "KRGCL", TUE, open_=open_, close=open_)
    report = await run_open_fill(desk, TUE)
    assert report.missed == [(KRGCL_ORDER, miss)]
    o = await order(desk)
    assert (o["status"], o["cancel_reason"], o["miss_reason"]) == (status, cancel, miss)
    audit = await last_audit(desk)
    assert (audit["action"], audit["payload"]["reason"]) == ("order.missed", miss)
    assert (await run_open_fill(desk, WED)).missed == []


async def test_no_price_waits_today_and_misses_later(desk: DictConn) -> None:
    await approved_krgcl(desk)
    assert (await run_open_fill(desk, TUE)).waiting == [KRGCL_ORDER]
    assert (await order(desk))["status"] == "pending_open"
    assert (await run_open_fill(desk, WED)).missed == [(KRGCL_ORDER, "no_price")]


async def test_intraday_order_fills_at_the_next_price(desk: DictConn) -> None:
    await history(desk, "KRGCL", MON)
    row = await one(desk, "SELECT card FROM trading.approvals WHERE proposal_id = %s", (KRGCL,))
    assert row is not None
    card = {**row["card"], "entry": "intraday_limit", "status": "approved", "decided_at": "2027-01-11T11:00:00.000Z",
            "approved_notional_try": None}  # fmt: skip
    events, job = await execute_approved(desk, card, DECIDE_AT)
    assert job is None and events[-1][1]["status"] == "accepted"
    assert (await run_open_fill(desk, MON)).fills == []  # placed at 14:00: its price is Monday's close
    await bar(desk, "KRGCL", MON, open_=33.40, close=33.50)
    report = await run_eod_fills(desk, MON)
    assert report.fills[0]["price"] == 33.52  # 33.50 × 1.0005
    assert (await order(desk))["filled_by"] == "eod_fill"


async def test_open_fill_settles_a_stale_auction_with_its_own_session(desk: DictConn) -> None:
    await approved_krgcl(desk)
    await bar(desk, "KRGCL", TUE, open_=33.60, close=33.70)
    later = add_sessions(TUE, 3)
    report = await run_open_fill(desk, later)
    assert report.fills[0]["price"] == 33.62
    assert Decimal(str(report.fills[0]["commission"])) > 0
