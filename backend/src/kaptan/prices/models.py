"""Value objects of the prices module (immutable; Decimal for every price)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Final, Literal

PriceBasis = Literal["raw", "adjusted"]
PriceSourceName = Literal["isyatirim", "yfinance", "borsapy"]
ActionKind = Literal["bedelsiz", "bedelli", "temettu", "split", "other"]

TICKER_RE: Final = re.compile(r"^[A-Z0-9]{3,8}$")


class InvalidTickerError(ValueError):
    """Not a BIST code (3–8 upper-case letters/digits, e.g. THYAO, XU100)."""


def normalise_ticker(raw: str) -> str:
    """'thyao ' / 'THYAO.IS' → 'THYAO'; raises InvalidTickerError for anything else."""
    t = raw.strip().upper().removesuffix(".IS")
    if not TICKER_RE.fullmatch(t):
        raise InvalidTickerError(f"invalid BIST ticker: {raw!r}")
    return t


@dataclass(frozen=True, slots=True)
class DailyBar:
    """One row of core.prices_daily. `price_basis='raw'` only for İş Yatırım `HG_*` levels."""

    ticker: str
    d: date
    close: Decimal
    source: PriceSourceName
    price_basis: PriceBasis
    open: Decimal | None = None
    high: Decimal | None = None
    low: Decimal | None = None
    volume: Decimal | None = None  # shares
    turnover_try: Decimal | None = None
    mcap_try: Decimal | None = None
    free_float_mcap_try: Decimal | None = None
    capital_try: Decimal | None = None
    ref_adj_close: Decimal | None = None  # İş Yatırım HGDG_KAPANIS as of fetched_at (cross-check only)
    open_source: Literal["isyatirim", "yfinance_scaled"] | None = None


@dataclass(frozen=True, slots=True)
class YahooBar:
    """A Yahoo chart row: `open/high/low/close` are split-adjusted, `adj_close` split + dividend adjusted."""

    d: date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    adj_close: Decimal
    volume: Decimal


@dataclass(frozen=True, slots=True)
class CorporateAction:
    """One row of core.corporate_actions. `factor` multiplies prices *before* `ex_date`."""

    ticker: str
    ex_date: date
    kind: ActionKind
    factor: Decimal
    source: str
    bonus_capital_pct: Decimal | None = None
    rights_pct: Decimal | None = None
    cash_gross: Decimal | None = None
    note: str | None = None


@dataclass(frozen=True, slots=True)
class Mark:
    """A point-in-time raw price for marking a position (P8: levels are always raw)."""

    ticker: str
    price: Decimal
    d: date
    field: Literal["open", "close"]
    known_at: datetime
    source: PriceSourceName
