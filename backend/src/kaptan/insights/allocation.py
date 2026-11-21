"""Where the money stands: the share of every holding and sector in the whole money (cash included), and the
limit the person set for one share ("Paranın %41'i tek hissede.").

The limit is informational: it only changes a sentence. It lives in `trading.insight_settings` ("concentration"),
default 25 %, set by `set_threshold` (audited). Shares are measured at the book's marks (`kaptan.risk.book`).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.api.deps import Actor
from kaptan.audit.writer import AuditDraft, append, user_actor
from kaptan.domain.schemas.insights import DEFAULT_CONCENTRATION_PCT
from kaptan.risk.book import own_book

UNKNOWN_SECTOR: Final = "Sektörü bilinmiyor"
KEY: Final = "concentration"
NAMES_SQL: Final = "SELECT ticker, name FROM core.issuers WHERE ticker = ANY(%s)"
GET_SQL: Final = "SELECT value FROM trading.insight_settings WHERE key = %s"
SET_SQL: Final = """
INSERT INTO trading.insight_settings (key, value, updated_at) VALUES (%s, %s, %s)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
"""


def _pct(part: Decimal, whole: Decimal) -> float:
    return round(float(part / whole * 100), 1) if whole > 0 else 0.0


def warning(top: dict[str, Any] | None, threshold: float) -> str | None:
    """ "Paranın %41'i tek hissede (ORNEK). Sınırın %25." when the biggest share is above the person's limit."""
    if top is None or top["pct"] <= threshold:
        return None
    pct = f"{top['pct']:g}".replace(".", ",")
    return f"Paranın %{pct}'i tek hissede ({top['ticker']}). Sınırın %{threshold:g}."


async def threshold(conn: AsyncConnection[Any]) -> int:
    async with conn.cursor() as cur:
        await cur.execute(GET_SQL, (KEY,))
        row = await cur.fetchone()
    return DEFAULT_CONCENTRATION_PCT if row is None else int(row["value"]["threshold_pct"])


async def _names(conn: AsyncConnection[Any], tickers: list[str]) -> dict[str, str]:
    async with conn.cursor() as cur:
        await cur.execute(NAMES_SQL, (tickers,))
        return {r["ticker"]: r["name"] for r in await cur.fetchall()}


async def allocation(conn: AsyncConnection[Any], now: datetime) -> dict[str, Any]:
    book = await own_book(conn, now)
    limit = await threshold(conn)
    equity = book.equity
    names = await _names(conn, [h.ticker for h in book.holdings])
    holdings: list[dict[str, Any]] = sorted(
        (
            {
                "ticker": h.ticker,
                "company": names.get(h.ticker, h.ticker),
                "sector": h.sector,
                "value_try": float(h.value),
                "pct": _pct(h.value, equity),
            }
            for h in book.holdings
        ),
        key=lambda h: -float(h["value_try"]),
    )
    sectors: dict[str, dict[str, Any]] = {}
    for h in holdings:
        key = str(h["sector"] or UNKNOWN_SECTOR)
        row = sectors.setdefault(key, {"sector": key, "value_try": 0.0, "pct": 0.0, "tickers": []})
        row["value_try"] = round(row["value_try"] + h["value_try"], 2)
        row["pct"] = round(row["pct"] + h["pct"], 1)
        row["tickers"].append(h["ticker"])
    return {
        "started": book.started,
        "equity_try": float(equity),
        "cash_try": float(book.cash),
        "cash_pct": _pct(book.cash, equity),
        "holdings": holdings,
        "sectors": sorted(sectors.values(), key=lambda s: -s["value_try"]),
        "threshold_pct": float(limit),
        "warning_tr": warning(holdings[0] if holdings else None, limit),
    }


async def set_threshold(conn: AsyncConnection[Any], pct: int, actor: Actor, now: datetime) -> dict[str, Any]:
    async with conn.transaction():
        await conn.execute(SET_SQL, (KEY, Jsonb({"threshold_pct": pct}), now))
        await append(
            conn,
            [
                AuditDraft(
                    user_actor(actor.uid), "concentration.threshold_set", "preferences", KEY, {"threshold_pct": pct}
                )
            ],
        )
    return await allocation(conn, now)
