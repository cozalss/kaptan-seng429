"""Your money against the dollar, inflation and a deposit over the same days.

You: the time-weighted return over the stored closes (free of deposits and withdrawals, `kaptan.insights.stats`).
Dollar: the TCMB indicative rate stored in `core.fx_rates` on the session before the first close and on the last
close (the newest bulletin of at most 10 days earlier); a missing rate hides the dollar line.
Inflation and deposit: no official series is wired in. TCMB's EVDS needs a personal key and its series codes could
not be verified, so these two are never estimated: they carry a plain reason instead of a number.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.insights.stats import compute, daily_returns
from kaptan.prices.calendar import CalendarRangeError, prev_session

FX_SQL: Final = """
SELECT rate FROM core.fx_rates WHERE currency = 'USD' AND d <= %s AND d >= %s ORDER BY d DESC LIMIT 1
"""
MAX_AGE_DAYS: Final = 10
NO_DOLLAR: Final = "Bu günler için kayıtlı kur yok."
NO_OFFICIAL: Final = "Resmi veri bu bilgisayara bağlı değil; tahmin yazmıyorum."
SOURCE_USD: Final = "TCMB döviz alış kuru"


async def _rate(conn: AsyncConnection[Any], day: date) -> float | None:
    async with conn.cursor() as cur:
        await cur.execute(FX_SQL, (day, day - timedelta(days=MAX_AGE_DAYS)))
        row = await cur.fetchone()
    return None if row is None else float(row["rate"])


def _item(key: str, label: str, pct: float | None, source: str | None, why: str | None) -> dict[str, Any]:
    return {"key": key, "label": label, "pct": pct, "source_tr": source, "hidden_reason_tr": why}


async def versus(conn: AsyncConnection[Any]) -> dict[str, Any]:
    rows = await daily_returns(conn)
    stats = compute(rows)
    if not stats["available"]:
        return {"available": False, "from": None, "to": None, "items": [], "reason_tr": stats["reason_tr"]}
    first, last = rows[0][0], rows[-1][0]
    usd: float | None = None
    try:
        start, end = await _rate(conn, prev_session(first)), await _rate(conn, last)
        usd = None if not start or not end else round((end / start - 1) * 100, 2)
    except CalendarRangeError:
        usd = None
    items = [
        _item("you", "Paran", stats["twr_pct"], "Kapanış kayıtların", None),
        _item("usd", "Dolar", usd, None if usd is None else SOURCE_USD, None if usd is not None else NO_DOLLAR),
        _item("inflation", "Enflasyon", None, None, NO_OFFICIAL),
        _item("deposit", "Mevduat faizi", None, None, NO_OFFICIAL),
    ]
    return {"available": True, "from": first, "to": last, "items": items, "reason_tr": None}
