"""Is this ticker on the person's watchlist? Then R03 (the 75-stock universe) does not veto it (agent INFO).

A watched company is analysed like any other. Everything else stays: restrictions, the ADV and position caps of
the risk gate (so a thin stock is sized small, and refused when its daily turnover is unknown), the price band,
quotas. A company the person explicitly excluded (`core.universe_overrides`, mode 'exclude') stays out even if it
is on the watchlist: their written exception wins over a star.
"""

from __future__ import annotations

from typing import Any, Final

from psycopg import AsyncConnection

WATCHED_SQL: Final = """
SELECT EXISTS (
  SELECT 1 FROM core.watchlist w
   WHERE w.ticker = %s
     AND NOT EXISTS (SELECT 1 FROM core.universe_overrides o WHERE o.ticker = w.ticker AND o.mode = 'exclude')
) AS watched
"""

#: Said on a suggestion card for a watched stock outside the universe (plain words; the size really is capped by ADV).
OUTSIDE_LIST_NOTE: Final = (
    "Bu hisse KAPtan'ın baktığı hisse listesinin dışında; izleme listende olduğu için inceledim. "
    "İşlem hacmi düşük: gösterilen fiyattan almak ya da sonra satmak zor olabilir. "
    "Tutarı günlük hacme göre sınırladım."
)

#: Said on the pre-gate line, in the audit and on the risk check.
WATCHED_NOTE: Final = "izleme listesinde: evren kuralı atlandı"


async def is_watched(conn: AsyncConnection[Any], ticker: str) -> bool:
    async with conn.cursor() as cur:
        await cur.execute(WATCHED_SQL, (ticker,))
        row = await cur.fetchone()
    return bool(row is not None and (row["watched"] if isinstance(row, dict) else row[0]))
