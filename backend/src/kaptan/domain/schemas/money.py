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


MovementStatus = Literal["active", "corrected", "undone"]


class MoneyMovement(KModel):
    """`amount_try`: the amount in force (a holding: its cost). A corrected row keeps the amount first typed in
    `original_amount_try`; an undone row stays in the list, marked. `changed_at`: when it was fixed."""

    id: str
    kind: MovementKind
    amount_try: float = Field(gt=0)
    occurred_at: IsoDateTime
    note: str
    status: MovementStatus
    original_amount_try: float | None
    changed_at: IsoDateTime | None


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


class MovementCorrectInput(KModel):
    """POST /me/money/{id}/correct. Money rows: `amount_try`. A hand-entered holding: `qty` + `avg_cost`
    (+ `bought_on`)."""

    amount_try: float | None = Field(default=None, gt=0, le=MAX_AMOUNT_TRY)
    qty: PosInt | None = None
    avg_cost: PosFloat | None = None
    bought_on: IsoDate | None = None
    note: str = Field(default="", max_length=200)


class BrokerFee(KModel):
    """GET/PUT /me/fee. Fractions: 0.002 is binde 2."""

    commission_rate: float
    default_rate: float
    bsmv: float
    own: bool


class BrokerFeeInput(KModel):
    """`commission_rate` null: back to KAPtan's built-in rate. 0 to 0.01 (yüzde 1)."""

    commission_rate: float | None = Field(default=None, ge=0, le=0.01)


class BookResetInput(KModel):
    """The word the person types to confirm ("baştan", any case)."""

    confirm: str = Field(max_length=40)


class BookResetOut(KModel):
    closed_book: int
    kill_switch_on: bool


class PreviousBookPosition(KModel):
    ticker: str
    qty: int
    avg_cost: float


class PreviousBook(KModel):
    """A closed book, as it stood when the person started over."""

    no: int
    opened_at: IsoDateTime
    closed_at: IsoDateTime
    started_with: float
    put_in: float
    cash: float
    equity: float
    movements: list[MoneyMovement]
    positions: list[PreviousBookPosition]
