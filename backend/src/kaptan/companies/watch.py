"""The watchlist ("İzlediklerim"): companies the person follows. Stored in `core.watchlist`, at most 50.

Starring and un-starring are audited in the same transaction (`watchlist.added` / `watchlist.removed`). The strip
on the home reads `watchlist_strip`: the latest close, the change on the last session and the newest disclosure.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append, user_actor
from kaptan.db import DictConn
from kaptan.reference._sql import execute, fetch_all, fetch_one

MAX_WATCHED: Final = 50
ENTITY: Final = "watchlist"

KNOWN_SQL: Final = """
SELECT 1 AS ok FROM core.issuers WHERE ticker = %(t)s
UNION SELECT 1 FROM core.issuer_profiles WHERE ticker = %(t)s
UNION SELECT 1 FROM core.disclosures WHERE primary_ticker = %(t)s
LIMIT 1
"""
COUNT_SQL: Final = "SELECT count(*) AS n FROM core.watchlist"
HAS_SQL: Final = "SELECT 1 AS ok FROM core.watchlist WHERE ticker = %s FOR UPDATE"
INSERT_SQL: Final = """
INSERT INTO core.watchlist (ticker, ord, added_at)
VALUES (%s, coalesce((SELECT max(ord) + 1 FROM core.watchlist), 1), %s)
"""
DELETE_SQL: Final = "DELETE FROM core.watchlist WHERE ticker = %s"
STRIP_SQL: Final = """
SELECT w.ticker, w.added_at,
       coalesce(p.name, i.name, (SELECT company_name FROM core.disclosures d WHERE d.primary_ticker = w.ticker
                                  ORDER BY published_at DESC LIMIT 1), w.ticker) AS name,
       (SELECT array_agg(c ORDER BY d DESC) FROM (
          SELECT DISTINCT ON (d) d, close AS c FROM core.prices_daily
           WHERE ticker = ANY(core.ticker_codes(w.ticker)) AND source = 'isyatirim' AND price_basis = 'raw'
           ORDER BY d DESC, ticker <> w.ticker LIMIT 2) s) AS closes,
       (SELECT max(d) FROM core.prices_daily
         WHERE ticker = ANY(core.ticker_codes(w.ticker)) AND source = 'isyatirim' AND price_basis = 'raw') AS price_day,
       (SELECT published_at FROM core.disclosures d
         WHERE d.primary_ticker = w.ticker OR w.ticker = ANY(d.stock_codes)
         ORDER BY published_at DESC LIMIT 1) AS newest_at
  FROM core.watchlist w
  LEFT JOIN core.issuer_profiles p ON p.ticker = w.ticker
  LEFT JOIN core.issuers i ON i.ticker = w.ticker
 ORDER BY w.ord
"""


def change_pct(closes: list[Any] | None) -> float | None:
    """Percent change of the latest close over the one before it; None without two closes. Pure."""
    if not closes or len(closes) < 2 or not closes[1]:
        return None
    return round((float(closes[0]) / float(closes[1]) - 1) * 100, 2)


async def is_watched(conn: DictConn, ticker: str) -> bool:
    return await fetch_one(conn, "SELECT 1 AS ok FROM core.watchlist WHERE ticker = %s", (ticker,)) is not None


async def watchlist_strip(conn: DictConn) -> list[dict[str, Any]]:
    rows = await fetch_all(conn, STRIP_SQL)
    return [
        {
            "ticker": r["ticker"],
            "name": r["name"],
            "added_at": r["added_at"],
            "last_close": float(r["closes"][0]) if r["closes"] else None,
            "price_day": r["price_day"],
            "change_pct": change_pct(r["closes"]),
            "newest_disclosure_at": r["newest_at"],
        }
        for r in rows
    ]


async def _audit(conn: DictConn, action: str, ticker: str, uid: str, now: datetime) -> None:
    draft = AuditDraft(
        actor=user_actor(uid),
        action=action,
        entity_type=ENTITY,
        entity_id=ticker,
        payload={"ticker": ticker},
        occurred_at=now,
    )
    await append(conn, [draft], now=now)


async def add_watch(conn: DictConn, ticker: str, *, uid: str, now: datetime) -> None:
    """Star a company. Already starred: nothing changes (no second record)."""
    async with conn.transaction():
        if await fetch_one(conn, KNOWN_SQL, {"t": ticker}) is None:
            raise ApiError(404, "not_found", "Bu kodla bir şirket bulamadım.")
        if await fetch_one(conn, HAS_SQL, (ticker,)) is not None:
            return
        count = await fetch_one(conn, COUNT_SQL)
        if count is not None and int(count["n"]) >= MAX_WATCHED:
            raise ApiError(
                409, "watchlist_full", f"İzleme listen dolu ({MAX_WATCHED} şirket). Birini çıkar, sonra ekle."
            )
        await execute(conn, INSERT_SQL, (ticker, now))
        await _audit(conn, "watchlist.added", ticker, uid, now)


async def remove_watch(conn: DictConn, ticker: str, *, uid: str, now: datetime) -> None:
    """Un-star a company. Not on the list: nothing changes."""
    async with conn.transaction():
        if await fetch_one(conn, HAS_SQL, (ticker,)) is None:
            return
        await execute(conn, DELETE_SQL, (ticker,))
        await _audit(conn, "watchlist.removed", ticker, uid, now)
