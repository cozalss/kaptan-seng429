"""The person's money (GET/POST /me/money, POST /me/holdings, POST /me/holdings/{id}/sell).

Mirrors kaptan-panel/src/lib/solo/money.ts. Money is TL as JSON numbers, times ISO-8601 UTC.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel, PosFloat, PosInt, Ticker

MAX_AMOUNT_TRY = 1e10

MovementKind = Literal["start", "deposit", "withdrawal", "holding"]
MoneyInputKind = Literal["start", "deposit", "withdrawal"]


class MoneyMovement(KModel):
    id: str
    kind: MovementKind
    amount_try: float = Field(gt=0)
    occurred_at: IsoDateTime
    note: str


class MoneyBook(KModel):
    """`cash`: the book's cash now. `put_in`: start + deposits - withdrawals + cost of the holdings entered by hand."""

    cash: float
    put_in: float
    movements: list[MoneyMovement]


class MoneyInput(KModel):
    kind: MoneyInputKind
    amount_try: float = Field(gt=0, le=MAX_AMOUNT_TRY)
    note: str = Field(default="", max_length=200)


class HoldingInput(KModel):
    """A share the person already owned before KAPtan."""

    ticker: Ticker
    qty: PosInt
    avg_cost: PosFloat
    bought_on: IsoDate


class HoldingSellInput(KModel):
    qty: PosInt
    price: PosFloat
    sold_at: IsoDateTime
    commission_try: float | None = Field(default=None, ge=0)
