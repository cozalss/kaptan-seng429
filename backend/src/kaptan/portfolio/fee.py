"""The person's broker commission rate (trading.broker_fee) and the cost model an estimate uses.

The rate is the commission the bank takes on the traded amount, as a fraction (0.002 = binde 2); the bank's tax
(BSMV) comes on top of it, like the built-in default. Nothing stored = the built-in default
(`kaptan.brokers.config`, trading.yaml). Every estimated commission (a ticket fill, a hand-entered sale) reads
`in_force()` and says which rate it used.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.api.deps import Actor
from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append
from kaptan.brokers import config as broker_config
from kaptan.brokers.config import Costs
from kaptan.portfolio import ledger

MAX_RATE: Final = Decimal("0.01")
OUT_OF_RANGE: Final = "Komisyon oranı sıfır ile yüzde 1 (binde 10) arasında olmalı."
RATE_SQL: Final = "SELECT commission_rate FROM trading.broker_fee WHERE id = 1"
UPSERT_SQL: Final = """
INSERT INTO trading.broker_fee (id, commission_rate, updated_at) VALUES (1, %s, %s)
ON CONFLICT (id) DO UPDATE SET commission_rate = EXCLUDED.commission_rate, updated_at = EXCLUDED.updated_at
"""


@dataclass(frozen=True, slots=True)
class FeeInForce:
    costs: Costs
    #: The broker commission rate the costs use (a fraction).
    rate: Decimal
    #: True when it is the person's own rate, False for the built-in default.
    own: bool


async def _stored(conn: AsyncConnection[Any]) -> Decimal | None:
    async with conn.cursor() as cur:
        await cur.execute(RATE_SQL)
        row = await cur.fetchone()
    return None if row is None else Decimal(row["commission_rate"])


async def in_force(conn: AsyncConnection[Any]) -> FeeInForce:
    base = broker_config.current().trading.costs
    own = await _stored(conn)
    if own is None:
        return FeeInForce(base, base.c_broker, False)
    return FeeInForce(replace(base, c_broker=own), own, True)


async def view(conn: AsyncConnection[Any]) -> dict[str, Any]:
    """BrokerFee: `commission_rate` is the rate in force; `own` says whose it is."""
    f = await in_force(conn)
    base = broker_config.current().trading.costs
    return {
        "commission_rate": float(f.rate),
        "default_rate": float(base.c_broker),
        "bsmv": float(base.bsmv),
        "own": f.own,
    }


async def set_rate(conn: AsyncConnection[Any], rate: float | None, actor: Actor, *, now: datetime) -> dict[str, Any]:
    """PUT /me/fee: store the person's rate (None: back to the built-in default). 422 out_of_range."""
    new = None if rate is None else Decimal(str(rate))
    if new is not None and not Decimal(0) <= new <= MAX_RATE:
        raise ApiError(422, "out_of_range", OUT_OF_RANGE)
    async with conn.transaction():
        await ledger.lock(conn)
        old = await _stored(conn)
        async with conn.cursor() as cur:
            if new is None:
                await cur.execute("DELETE FROM trading.broker_fee WHERE id = 1")
            else:
                await cur.execute(UPSERT_SQL, (new, now))
        payload = {"old_rate": None if old is None else float(old), "new_rate": None if new is None else float(new)}
        await append(
            conn, [AuditDraft(actor.audit_actor, "fee.changed", "book", "komisyon", payload, occurred_at=now)], now=now
        )
    return await view(conn)
