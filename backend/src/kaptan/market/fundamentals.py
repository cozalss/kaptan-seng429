"""E4 features from `core.fundamentals_pit` (06 §3.4, 07 §9 P3), point in time; "unknown" when not stored.

    core_op_q   = operating_profit_q (one-off items are not stored yet: the hook is `ONE_OFF_ITEM`)
    Δcore       = core_op_q − core_op_{q−4}
    SUE_real    = Δcore_q / sd(Δcore, last 8 quarters)      fewer than 6 Δcore values → unknown
    cfo_quality = cfo_ttm / net_income_ttm                   net income ≤ 0: "iyi" iff cfo_ttm > 0

The table comes with the data-jobs migration (0016). Until it exists, or while a company has too few
rows, every E4 number is unknown — never estimated. Each (period, item) takes its newest version
published strictly before `as_of` (restated figures replace older ones only once they were public);
rows of the disclosure itself (`source_disclosure`) count, because the report *is* the event.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.rows import dict_row

Conn = AsyncConnection[Any]

UNKNOWN: Final = "unknown"
CORE_ITEM: Final = "operating_profit_q"
#: Hook: when one-off items get their own row (06 §3.4 "tek seferlik kalemler"), core = op − one_off.
ONE_OFF_ITEM: Final = "one_off_items_q"
ITEMS: Final = (CORE_ITEM, ONE_OFF_ITEM, "cfo_ttm", "net_income_ttm")
SUE_WINDOW: Final = 8
MIN_DELTAS: Final = 6  # 06 §13 events.E4.min_quarters
EXISTS_SQL: Final = "SELECT to_regclass('core.fundamentals_pit') IS NOT NULL AS ok"
ROWS_SQL: Final = """
SELECT DISTINCT ON (period_end, item) period_end, item, value, is_inflation_adj
  FROM core.fundamentals_pit
 WHERE ticker = %(ticker)s AND item = ANY(%(items)s::text[])
   AND (available_at < %(as_of)s OR source_disclosure = %(self)s)
 ORDER BY period_end, item, available_at DESC
"""


@dataclass(frozen=True, slots=True)
class FundamentalRow:
    period_end: date
    item: str
    value: Decimal
    is_inflation_adj: bool | None


async def load_rows(conn: Conn, ticker: str, as_of: datetime, self_index: int) -> list[FundamentalRow] | None:
    """The PIT rows, or None when the table does not exist yet."""
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(EXISTS_SQL)
        found = await cur.fetchone()
        if not found or not found["ok"]:
            return None
        await cur.execute(ROWS_SQL, {"ticker": ticker, "items": list(ITEMS), "as_of": as_of, "self": self_index})
        rows = await cur.fetchall()
    return [FundamentalRow(r["period_end"], r["item"], Decimal(r["value"]), r.get("is_inflation_adj")) for r in rows]


def _series(rows: Sequence[FundamentalRow], item: str) -> dict[date, Decimal]:
    return {r.period_end: r.value for r in rows if r.item == item}


def _quarter(d: date) -> int:
    return d.year * 4 + (d.month - 1) // 3


def sue(rows: Sequence[FundamentalRow]) -> float | None:
    core = _series(rows, CORE_ITEM)
    one_off = _series(rows, ONE_OFF_ITEM)
    by_q = {_quarter(d): v - one_off.get(d, Decimal(0)) for d, v in core.items()}
    if not by_q:
        return None
    last = max(by_q)
    deltas: list[float] = []  # newest first
    for i in range(last, last - SUE_WINDOW, -1):
        now, then = by_q.get(i), by_q.get(i - 4)
        if now is None or then is None:
            if i == last:
                return None  # the latest quarter itself has no year-ago comparison
            continue
        deltas.append(float(now - then))
    if len(deltas) < MIN_DELTAS:
        return None
    mean = math.fsum(deltas) / len(deltas)
    sd = math.sqrt(math.fsum((x - mean) ** 2 for x in deltas) / (len(deltas) - 1))
    return None if sd <= 0 else round(deltas[0] / sd, 4)


def cfo_quality(rows: Sequence[FundamentalRow]) -> float | str:
    cfo, ni = _series(rows, "cfo_ttm"), _series(rows, "net_income_ttm")
    common = sorted(set(cfo) & set(ni))
    if not common:
        return UNKNOWN
    last = common[-1]
    if ni[last] <= 0:
        return "iyi" if cfo[last] > 0 else "zayıf"  # 06 §3.4: net kâr ≤ 0 → CFO_TTM > 0 şartı
    return round(float(cfo[last] / ni[last]), 4)


def e4_features(rows: Sequence[FundamentalRow] | None) -> dict[str, Any]:
    """The `MergedFeatures.e4` block; "unknown" marks what the stored data cannot give."""
    if rows is None:
        return {"e4_sue": None, "e4_cfo_quality": UNKNOWN, "e4_tms29": None, "e4_data": UNKNOWN}
    tms29 = next((r.is_inflation_adj for r in sorted(rows, key=lambda r: r.period_end, reverse=True)), None)
    s = sue(rows)
    return {
        "e4_sue": s,
        "e4_cfo_quality": cfo_quality(rows),
        "e4_tms29": tms29,
        "e4_data": "fundamentals_pit" if s is not None else UNKNOWN,
    }
