"""Point-in-time reads of `core.fundamentals_pit` (07 P3, FR-13): only rows with `available_at < as_of`.

    vals = await fundamentals_as_of(conn, "THYAO", as_of, ["revenue_q", "operating_profit_q", "cfo_ttm"])
    vals["revenue_q"].value, vals["revenue_q"].period_end, vals["revenue_q"].available_at
    rev = await revenue_as_of(conn, "THYAO", as_of)        # TTM, else the last annual revenue

For each item the newest `period_end` known before `as_of` wins (and, for one period, its latest
known version). `history_as_of()` gives an item's series (e.g. the 8 quarters SUE needs, 06 §3.4),
newest first. Renamed codes are followed (`core.ticker_codes`).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Final

from kaptan.reference._sql import Conn, fetch_all

ITEMS: Final = frozenset(
    {
        "revenue_ttm", "revenue_annual", "net_income_ttm", "paid_in_capital", "equity", "shares_outstanding",
        "revenue_q", "operating_profit_q", "net_monetary_position_gain_q", "net_profit_parent_q", "cfo_ttm",
    }
)  # fmt: skip
#: A revenue figure for a period that ended longer ago than this is not "the company's revenue" any more.
MAX_REVENUE_AGE: Final = timedelta(days=550)


@dataclass(frozen=True, slots=True)
class FundamentalValue:
    item: str
    value: Decimal
    period_end: date
    available_at: datetime
    currency: str
    is_inflation_adj: bool
    basis: str  # kap_fr_publish | period_end_plus_legal_deadline
    source_disclosure: int | None


AS_OF_SQL: Final = """
SELECT DISTINCT ON (item) item, value, period_end, available_at, currency, is_inflation_adj,
       available_at_basis, source_disclosure
  FROM core.fundamentals_pit
 WHERE ticker = ANY(core.ticker_codes(%s)) AND item = ANY(%s::text[]) AND available_at < %s
 ORDER BY item, period_end DESC, available_at DESC
"""
HISTORY_SQL: Final = """
SELECT DISTINCT ON (period_end) item, value, period_end, available_at, currency, is_inflation_adj,
       available_at_basis, source_disclosure
  FROM core.fundamentals_pit
 WHERE ticker = ANY(core.ticker_codes(%s)) AND item = %s AND available_at < %s
 ORDER BY period_end DESC, available_at DESC
 LIMIT %s
"""


def _value(r: dict[str, Any]) -> FundamentalValue:
    return FundamentalValue(
        item=str(r["item"]),
        value=r["value"],
        period_end=r["period_end"],
        available_at=r["available_at"],
        currency=str(r["currency"]),
        is_inflation_adj=bool(r["is_inflation_adj"]),
        basis=str(r["available_at_basis"]),
        source_disclosure=None if r["source_disclosure"] is None else int(r["source_disclosure"]),
    )


def _check(items: Sequence[str]) -> list[str]:
    unknown = sorted(set(items) - ITEMS)
    if unknown:
        raise ValueError(f"unknown fundamentals item(s): {', '.join(unknown)}")
    return list(dict.fromkeys(items))


async def fundamentals_as_of(
    conn: Conn, ticker: str, as_of: datetime, items: Sequence[str]
) -> dict[str, FundamentalValue]:
    """item → its latest value known strictly before `as_of`; items without one are absent."""
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone-aware")
    rows = await fetch_all(conn, AS_OF_SQL, (ticker, _check(items), as_of))
    return {str(r["item"]): _value(r) for r in rows}


async def history_as_of(
    conn: Conn, ticker: str, as_of: datetime, item: str, *, limit: int = 8
) -> list[FundamentalValue]:
    """The item's last `limit` periods known before `as_of`, newest first."""
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone-aware")
    rows = await fetch_all(conn, HISTORY_SQL, (ticker, _check([item])[0], as_of, limit))
    return [_value(r) for r in rows]


async def revenue_as_of(conn: Conn, ticker: str, as_of: datetime) -> FundamentalValue | None:
    """E3's denominator (06 §3.3): TTM revenue, else the last annual; None when unknown, stale or ≤ 0."""
    vals = await fundamentals_as_of(conn, ticker, as_of, ["revenue_ttm", "revenue_annual"])
    picks = [v for v in (vals.get("revenue_ttm"), vals.get("revenue_annual")) if v is not None]
    picks.sort(key=lambda v: (v.period_end, v.item == "revenue_ttm"), reverse=True)
    for v in picks:
        if v.value > 0 and as_of.date() - v.period_end <= MAX_REVENUE_AGE:
            return v
    return None
