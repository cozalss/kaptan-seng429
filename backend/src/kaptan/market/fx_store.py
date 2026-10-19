"""`core.fx_rates` reads and writes (migration 0013). Parametrised SQL only.

rate = await rate_at(conn, "USD", as_of)      # None: no published rate before as_of (unknown)
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.market.fx import FxRate
from kaptan.text.turkish import tr_upper

Conn = AsyncConnection[Any]

#: Older than this the newest bulletin is not "the rate valid at the decision" (holiday gaps are ≤ 9 days).
MAX_RATE_AGE: Final = timedelta(days=10)
#: Spellings the Reader may use for a currency (ISO code after normalisation).
ALIASES: Final[dict[str, str]] = {
    "TL": "TRY",
    "TRY": "TRY",
    "₺": "TRY",
    "TÜRK LİRASI": "TRY",
    "USD": "USD",
    "$": "USD",
    "ABD DOLARI": "USD",
    "DOLAR": "USD",
    "EUR": "EUR",
    "€": "EUR",
    "AVRO": "EUR",
    "EURO": "EUR",
    "GBP": "GBP",
    "£": "GBP",
    "STERLİN": "GBP",
    "CHF": "CHF",
    "JPY": "JPY",
    "CNY": "CNY",
}

UPSERT_SQL: Final = """
INSERT INTO core.fx_rates (d, currency, rate, available_at, source, fetched_at)
VALUES (%s, %s, %s, %s, %s, now())
ON CONFLICT (d, currency) DO UPDATE SET rate = EXCLUDED.rate, available_at = EXCLUDED.available_at,
  source = EXCLUDED.source, fetched_at = now()
"""
RATE_AT_SQL: Final = """
SELECT d, rate, available_at FROM core.fx_rates
 WHERE currency = %s AND available_at < %s AND available_at >= %s
 ORDER BY available_at DESC LIMIT 1
"""


def currency_code(raw: str | None) -> str | None:
    """ISO code of a Reader currency ("TL", "ABD Doları", "€" …); None when it cannot be told."""
    if raw is None or not raw.strip():
        return None
    key = tr_upper(raw.strip())
    if key in ALIASES:
        return ALIASES[key]
    for alias, code in ALIASES.items():
        if len(alias) >= 4 and alias in key:  # words only ("ABD Doları cinsinden")
            return code
    return key if len(key) == 3 and key.isalpha() and key.isascii() else None


async def upsert_rates(conn: Conn, rates: Sequence[FxRate]) -> int:
    rows = [(r.d, r.currency, r.rate, r.available_at, r.source) for r in rates if r.currency != "TRY"]
    if not rows:
        return 0
    async with conn.cursor() as cur:
        await cur.executemany(UPSERT_SQL, rows)
    return len(rows)


async def rate_at(conn: Conn, currency: str, as_of: datetime) -> Decimal | None:
    """TRY per unit valid at `as_of`: the newest bulletin published strictly before it (TRY → 1)."""
    if currency == "TRY":
        return Decimal(1)
    async with conn.cursor() as cur:
        await cur.execute(RATE_AT_SQL, (currency, as_of, as_of - MAX_RATE_AGE))
        row = await cur.fetchone()
    if row is None:
        return None
    rate = row["rate"] if isinstance(row, dict) else row[1]
    return Decimal(rate)
