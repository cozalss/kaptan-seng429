"""Helpers of the tests on the person's own book: an approval writes only a ticket, the person's real fill
(`service.mark_ticket`) moves cash and shares. Everything runs on one rolled-back connection.

The helpers here (`desk`, `history`, `approve`, `empty_book`, `start_money`, …) are shared by those tests.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, date, datetime
from typing import Any

import pytest

from kaptan.api.deps import Actor
from kaptan.approvals import service
from kaptan.brokers import config as bc
from kaptan.brokers.config import ExecConfig
from kaptan.db import DictConn
from kaptan.domain.schemas import ApprovalDecision
from kaptan.domain.schemas.money import MoneyInput
from kaptan.portfolio import money
from kaptan.prices.calendar import prev_session

KRGCL = "prop-day-e1-krgcl"
MON, TUE, WED = date(2027, 1, 11), date(2027, 1, 12), date(2027, 1, 13)
#: Monday 14:00 Istanbul: the KRGCL card (next-open, limit 34.15) is still pending.
DECIDE_AT = datetime(2027, 1, 11, 11, 0, tzinfo=UTC)
RISK_OFFICER = Actor(uid="sahip", name="Sahip", family="t")
APPROVE = ApprovalDecision(decision="approve", approved_notional_try=None, comment="")


@pytest.fixture
async def desk(pg: DictConn) -> AsyncIterator[DictConn]:
    """The seeded day, one transaction that is rolled back afterwards."""
    await pg.execute("SELECT 1")  # open the transaction: every `conn.transaction()` below is a savepoint
    bc.install(ExecConfig())
    try:
        yield pg
    finally:
        bc.reset()


async def empty_book(conn: DictConn) -> None:
    """The demo seed's book removed: the person has not entered anything yet."""
    for sql in ("DELETE FROM trading.book_ledger", "DELETE FROM trading.positions", "DELETE FROM trading.pnl_daily"):
        await conn.execute(sql)


async def start_money(conn: DictConn, amount: int, at: datetime) -> None:
    await money.add_money(conn, MoneyInput(kind="start", amount_try=amount), RISK_OFFICER, now=at)


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
    return await service.decide(conn, proposal_id, APPROVE, RISK_OFFICER, now=now)


async def one(conn: DictConn, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        row = await cur.fetchone()
    return None if row is None else dict(row)


async def last_audit(conn: DictConn) -> dict[str, Any]:
    row = await one(conn, "SELECT actor, action, payload FROM audit.audit_log ORDER BY chain_pos DESC LIMIT 1")
    assert row is not None
    return row
