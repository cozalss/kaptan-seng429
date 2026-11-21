"""The person's money line against BIST 100 over the same days.

The person's result is the chain of the book's daily returns in trading.pnl_daily, which are already free of
deposits and withdrawals (`kaptan.risk.book`), so adding money never looks like a gain. BIST 100 is the stored
XU100 close (Yahoo; the 18:30 price job and the warm-up load it): from the session before the first day to the
last day. If either close is not stored, or fewer than two days exist, nothing is said: no guess.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.portfolio.pnl import LIVE_STRATEGY
from kaptan.prices.calendar import CalendarRangeError, prev_session
from kaptan.prices.reads import adjusted_series
from kaptan.reports.words import day_tr, moved

INDEX: Final = "XU100"
MIN_DAYS: Final = 2
ROWS_SQL: Final = """
SELECT d, daily_return FROM trading.pnl_daily WHERE strategy = %s
   AND (%s::date IS NULL OR d >= %s) AND (%s::date IS NULL OR d <= %s) ORDER BY d
"""


def _none(reason: str, start: date | None = None, end: date | None = None) -> dict[str, Any]:
    return {"start": start, "end": end, "available": False, "you_ratio": None, "index_ratio": None,
            "sentence_tr": None, "reason_tr": reason}  # fmt: skip


async def benchmark(conn: AsyncConnection[Any], start: date | None = None, end: date | None = None) -> dict[str, Any]:
    """Benchmark document for [start, end] (default: every stored day)."""
    async with conn.cursor() as cur:
        await cur.execute(ROWS_SQL, (LIVE_STRATEGY, start, start, end, end))
        rows = list(await cur.fetchall())
    if len(rows) < MIN_DAYS:
        return _none("Karşılaştırmak için henüz en az iki borsa günü kapanışı yok.")
    first, last = rows[0]["d"], rows[-1]["d"]
    you = 1.0
    for r in rows:
        you *= 1 + float(r["daily_return"])
    you -= 1
    try:
        before = prev_session(first)
    except CalendarRangeError:
        return _none("BIST 100 bu günler için kayıtlı değil.", first, last)
    _src, bars = await adjusted_series(conn, INDEX, before, last, source="yfinance")
    if before not in bars or last not in bars or bars[before][1] <= 0:
        return _none("BIST 100 fiyatı bu günler için kayıtlı değil.", first, last)
    index = float(bars[last][1] / bars[before][1] - 1)
    sentence = (
        f"{day_tr(first)} – {day_tr(last)} arasında {moved(you, 'paran')}; aynı sürede {moved(index, 'BIST 100')}."
    )
    return {"start": first, "end": last, "available": True, "you_ratio": you, "index_ratio": index,
            "sentence_tr": sentence, "reason_tr": None}  # fmt: skip
