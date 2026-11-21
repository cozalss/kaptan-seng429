"""Dividend income: only what the person recorded (`trading.corporate_book`), never a forecast.

Monthly totals for the last twelve months (Istanbul time), this year against last year, and per holding the last
twelve months over what the shares still held cost (yield on cost). A holding sold out has no cost, so no yield.
Undone records are not counted.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.insights.replay import Pool, replay_book
from kaptan.prices.calendar import istanbul_date

ROWS_SQL: Final = """
SELECT c.ticker, coalesce(i.name, c.ticker) AS company, c.net_try,
       (c.effective_at AT TIME ZONE 'Europe/Istanbul')::date AS d
  FROM trading.corporate_book c LEFT JOIN core.issuers i ON i.ticker = c.ticker
 WHERE c.kind = 'dividend' AND c.corrects_id IS NULL AND c.book_no = (SELECT max(no) FROM trading.book_epochs)
   AND NOT EXISTS (SELECT 1 FROM trading.corporate_book u WHERE u.corrects_id = c.id)
 ORDER BY c.effective_at
"""


def _month_back(today: date, back: int) -> tuple[int, int]:
    index = today.year * 12 + today.month - 1 - back
    return index // 12, index % 12 + 1


def build(rows: list[dict[str, Any]], pools: dict[str, Pool], today: date) -> dict[str, Any]:
    months = [_month_back(today, n) for n in range(11, -1, -1)]
    by_month: dict[tuple[int, int], Decimal] = defaultdict(Decimal)
    last12: dict[str, Decimal] = defaultdict(Decimal)
    names: dict[str, str] = {}
    this_year = last_year = total = Decimal(0)
    for r in rows:
        net, d = Decimal(r["net_try"]), r["d"]
        total += net
        this_year += net if d.year == today.year else 0
        last_year += net if d.year == today.year - 1 else 0
        key = (d.year, d.month)
        if key in months:
            by_month[key] += net
            last12[r["ticker"]] += net
            names[r["ticker"]] = r["company"]
    holdings = []
    for ticker, got in sorted(last12.items(), key=lambda kv: -kv[1]):
        pool = pools.get(ticker)
        cost = pool.cost if pool is not None and pool.cost > 0 else None
        holdings.append(
            {
                "ticker": ticker,
                "company": names[ticker],
                "last12_try": round(float(got), 2),
                "cost_try": None if cost is None else round(float(cost), 2),
                "yield_on_cost_pct": None if cost is None else round(float(got / cost * 100), 2),
            }
        )
    return {
        "year": today.year,
        "this_year_try": round(float(this_year), 2),
        "last_year_try": round(float(last_year), 2),
        "total_try": round(float(total), 2),
        "months": [{"month": f"{y}-{m:02d}", "total_try": round(float(by_month[(y, m)]), 2)} for y, m in months],
        "holdings": holdings,
    }


async def dividend_income(conn: AsyncConnection[Any], now: datetime) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(ROWS_SQL)
        rows = [dict(r) for r in await cur.fetchall()]
    _, pools = await replay_book(conn)
    return build(rows, pools, istanbul_date(now))
