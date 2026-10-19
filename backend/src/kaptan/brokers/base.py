"""The broker protocol (04 §8.1): every adapter takes an `OrderIntent` and answers with an `OrderAck`.

Adapters are bound to one database transaction (`conn`) and one instant (`now`): SimBIST books the
order in trading.orders, OrderTicket writes the personal-mode ticket. `GuardedBroker` wraps any of
them with the checks that live outside the agent graph (kill switch, hard cap, live keys).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from enum import StrEnum
from typing import Any, Literal, Protocol, runtime_checkable

OrderStatus = Literal[
    "pending_open", "accepted", "awaiting_manual_entry", "partially_filled", "filled", "canceled", "rejected"
]


class BrokerMode(StrEnum):
    PAPER = "paper"
    MANUAL = "manual"
    LIVE = "live"


@dataclass(frozen=True, slots=True)
class OrderIntent:
    """What to send. `context` carries what an adapter needs besides the order (the approval card)."""

    client_order_id: str
    ticker: str
    side: Literal["buy", "sell"]
    order_type: Literal["market", "limit"]
    time_in_force: Literal["day", "opg"]  # opg = opening auction
    qty: int  # BIST: whole shares
    limit_price: Decimal | None = None
    context: Mapping[str, Any] = field(default_factory=dict)

    @property
    def notional(self) -> Decimal:
        return Decimal(self.qty) * (self.limit_price or Decimal(0))


@dataclass(frozen=True, slots=True)
class OrderAck:
    client_order_id: str
    broker_order_id: str | None
    status: OrderStatus
    filled_qty: int = 0
    avg_fill_price: Decimal | None = None
    raw: Mapping[str, Any] = field(default_factory=dict)


class BrokerError(RuntimeError):
    """An adapter could not take the order."""


class OrderRefused(BrokerError):  # noqa: N818 - the domain word ("refused at send")
    """GuardedBroker refused the order at send; `code` is machine-readable (kill_switch, hard_cap, …)."""

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


class LiveNotArmed(BrokerError):  # noqa: N818 - name from 09 §8
    """A live send without all three keys (or without a real broker)."""


@runtime_checkable
class Broker(Protocol):
    name: str
    mode: BrokerMode

    async def submit_order(self, intent: OrderIntent) -> OrderAck: ...

    async def get_order(self, client_order_id: str) -> OrderAck | None: ...

    async def cancel_order(self, client_order_id: str) -> None: ...

    async def cancel_all(self) -> int: ...
