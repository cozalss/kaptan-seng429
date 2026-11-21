"""One search box: companies by ticker or name, disclosures by words.

Matching folds Turkish letters on both sides (İ/i/I/ı, ş/s, ğ/g, ç/c, ö/o, ü/u), so "turk hava" finds
"Türk Hava Yolları" and "ISBANK" finds "İşbank". Company names are matched in Python (a few hundred rows);
disclosure words are matched in SQL with the same folding, over the last SEARCH_DAYS days.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.reference._sql import fetch_all
from kaptan.text.turkish import join_key

MIN_QUERY: Final = 2
MAX_QUERY: Final = 60
COMPANY_LIMIT: Final = 8
DISCLOSURE_LIMIT: Final = 10
SEARCH_DAYS: Final = 120
TICKER_SHAPE: Final = re.compile(r"^[A-Z0-9]{3,6}$")

COMPANIES_SQL: Final = """
SELECT t.ticker, coalesce(p.name, i.name, t.ticker) AS name, coalesce(p.sector, i.sector, '') AS sector
  FROM (SELECT ticker FROM core.issuers UNION SELECT ticker FROM core.issuer_profiles) t
  LEFT JOIN core.issuer_profiles p ON p.ticker = t.ticker
  LEFT JOIN core.issuers i ON i.ticker = t.ticker
 WHERE t.ticker ~ '^[A-Z0-9]{3,6}$'
"""
#: The same folding as `join_key` for one SQL expression (I → ı → i; İ → i; accents dropped).
FOLD_SQL: Final = "translate(lower(replace(replace({x}, 'İ', 'i'), 'I', 'ı')), 'ıçğöşüâîû', 'icgosuaiu')"
DISCLOSURES_SQL: Final = f"""
SELECT disclosure_index, primary_ticker, company_name, subject, summary, published_at
  FROM core.disclosures
 WHERE published_at >= %(since)s AND is_noise = false
   AND {FOLD_SQL.format(x="(subject || ' ' || summary || ' ' || company_name)")} LIKE ALL (%(patterns)s::text[])
 ORDER BY published_at DESC, disclosure_index DESC
 LIMIT %(limit)s
"""  # noqa: S608


def clean_query(q: str) -> str:
    return q.strip()[:MAX_QUERY]


def _like_pattern(word: str) -> str:
    escaped = word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def rank_company(query: str, ticker: str, name: str) -> int | None:
    """Lower is better; None = no match. Pure."""
    key, tkey, nkey = join_key(query), join_key(ticker), join_key(name)
    if not key:
        return None
    if tkey == key:
        return 0
    if tkey.startswith(key):
        return 1
    if nkey.startswith(key):
        return 2
    if any(w.startswith(key) for w in nkey.split()):
        return 3
    if key in nkey:
        return 4
    return None


async def search_companies(conn: AsyncConnection[Any], query: str) -> list[dict[str, Any]]:
    rows = await fetch_all(conn, COMPANIES_SQL)
    ranked = [(r, rank_company(query, r["ticker"], r["name"])) for r in rows]
    hits = sorted(((rank, r["ticker"], r) for r, rank in ranked if rank is not None), key=lambda x: (x[0], x[1]))
    return [{"ticker": r["ticker"], "name": r["name"], "sector": r["sector"]} for _, _, r in hits[:COMPANY_LIMIT]]


async def search_disclosures(conn: AsyncConnection[Any], query: str, now: datetime) -> list[dict[str, Any]]:
    words = [w for w in join_key(query).split() if w]
    if not words:
        return []
    params = {
        "since": now - timedelta(days=SEARCH_DAYS),
        "patterns": [_like_pattern(w) for w in words[:5]],
        "limit": DISCLOSURE_LIMIT,
    }
    rows = await fetch_all(conn, DISCLOSURES_SQL, params)
    return [
        {
            "disclosure_index": r["disclosure_index"],
            "ticker": r["primary_ticker"]
            if r["primary_ticker"] and TICKER_SHAPE.fullmatch(r["primary_ticker"])
            else None,
            "company_name": r["company_name"],
            "subject": r["subject"],
            "published_at": r["published_at"],
        }
        for r in rows
    ]


async def search(conn: AsyncConnection[Any], query: str, now: datetime) -> dict[str, Any]:
    q = clean_query(query)
    if len(q) < MIN_QUERY:
        return {"q": q, "companies": [], "disclosures": []}
    return {"q": q, "companies": await search_companies(conn, q), "disclosures": await search_disclosures(conn, q, now)}
