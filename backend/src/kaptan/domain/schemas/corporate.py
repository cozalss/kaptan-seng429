"""Company actions on the person's shares: dividends, bonus issues, rights issues, and the KAP notices about them.

Mirrors kaptan-panel/src/lib/domain/corporate.ts. Money is TL as JSON numbers, times ISO-8601 UTC.
"""

from __future__ import annotations

from typing import Literal, Self

from pydantic import Field, model_validator

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel, PosInt, Ticker

MAX_AMOUNT_TRY = 1e10
MAX_BONUS_PCT = 10_000.0

CorporateKind = Literal["dividend", "bonus", "rights"]
NoticeKind = Literal["dividend", "bonus", "rights", "split"]


class DividendInput(KModel):
    """Cash the bank paid in: `net_try` is what arrived (after withholding, as the bank shows it)."""

    ticker: Ticker
    net_try: float = Field(gt=0, le=MAX_AMOUNT_TRY)
    gross_try: float | None = Field(default=None, gt=0, le=MAX_AMOUNT_TRY)
    received_on: IsoDate
    note: str = Field(default="", max_length=200)
    notice_id: str | None = Field(default=None, max_length=60)


class BonusInput(KModel):
    """A bonus issue or a split: the new total share count OR the bonus percentage (100 = one new per share)."""

    ticker: Ticker
    ex_date: IsoDate
    new_qty: PosInt | None = None
    bonus_pct: float | None = Field(default=None, gt=0, le=MAX_BONUS_PCT)
    note: str = Field(default="", max_length=200)
    notice_id: str | None = Field(default=None, max_length=60)

    @model_validator(mode="after")
    def _one_of(self) -> Self:
        if (self.new_qty is None) == (self.bonus_pct is None):
            raise ValueError("Yeni adedi ya da yüzdeyi yaz; ikisini birden değil.")
        return self


class RightsInput(KModel):
    """A rights issue (bedelli): `qty` new shares bought at `price` each, paid from cash."""

    ticker: Ticker
    subscribed_on: IsoDate
    qty: PosInt
    price: float = Field(gt=0, le=MAX_AMOUNT_TRY)
    note: str = Field(default="", max_length=200)
    notice_id: str | None = Field(default=None, max_length=60)


class CorporateRecord(KModel):
    """One thing the person recorded. A correction names the record it undoes in `corrects`."""

    id: str
    kind: CorporateKind
    ticker: str
    company: str
    occurred_at: IsoDateTime
    recorded_at: IsoDateTime
    net_try: float | None
    gross_try: float | None
    qty_added: int | None
    qty_after: int | None
    price: float | None
    note: str
    corrects: str | None
    undone: bool


class DividendTotal(KModel):
    """What one share paid the person: this calendar year (Istanbul) and in all."""

    ticker: str
    company: str
    this_year_try: float
    total_try: float


class CorporateBook(KModel):
    this_year_try: float
    total_try: float
    per_holding: list[DividendTotal]
    records: list[CorporateRecord]


class CorporateNotice(KModel):
    """A KAP disclosure about an action on a share the person holds. Facts the code could not read are null."""

    id: str
    ticker: str
    kind: NoticeKind
    headline: str
    published_at: IsoDateTime
    held_qty: int
    per_share_gross_try: float | None
    per_share_net_try: float | None
    pay_date: IsoDate | None
    ex_date: IsoDate | None
    bonus_pct: float | None
    expected_gross_try: float | None
    facts_note: str
    url: str


class NoticeAnswer(KModel):
    notices: list[CorporateNotice]
