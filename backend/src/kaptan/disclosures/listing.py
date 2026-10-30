"""The disclosures of one Istanbul day, newest first (GET /disclosures).

DEMO_MODE: the visible rows of the demo day (whatever `day` says, there is only one). Otherwise: every KAP
row published on that Istanbul day — the live poller's rows and, for earlier days, the backfilled history
(`ingest_source='backfill'`), so the first start of the live stack can show the last few days at once.
Codes that do not fit the panel's ticker shape (warrants, funds) are left out of the code lists.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.text.turkish import IST

MAX_LIMIT: Final = 500
TICKER_SHAPE: Final = re.compile(r"^[A-Z0-9]{3,6}$")
CLASSIFICATION_KEYS: Final = frozenset({"event_type", "confidence", "method"})
EVENT_TYPES: Final = frozenset({"E1", "E2", "E3", "E4", "IGNORE"})

LIST_SQL: Final = """
SELECT d.disclosure_index, d.disclosure_oid, d.stock_codes, d.related_stocks, d.primary_ticker, d.company_name,
       d.disclosure_class, d.disclosure_type, d.subject, d.summary, d.reason, d.related_index, d.is_late,
       d.attachment_count, d.has_multilang, d.is_noise, d.subject_route, d.subject_map_version, d.published_at,
       d.first_seen_at, d.available_at, d.ingest_source, d.classification, d.run_id, d.linked_news_count,
       d.note_count
  FROM core.disclosures d
 WHERE (CASE WHEN %(demo)s THEN d.visible
             ELSE d.published_at >= %(start)s AND d.published_at < %(end)s END)
   AND (%(ticker)s::text IS NULL OR d.primary_ticker = %(ticker)s OR %(ticker)s = ANY(d.stock_codes))
 ORDER BY d.published_at DESC, d.disclosure_index DESC
 LIMIT %(limit)s
"""


def _codes(values: list[str] | None) -> list[str]:
    return [v for v in (values or []) if TICKER_SHAPE.fullmatch(v)]


def _classification(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict) or not value.keys() >= CLASSIFICATION_KEYS:
        return None
    if value["event_type"] not in EVENT_TYPES or value["method"] not in ("subject_map", "llm"):
        return None
    return {k: value[k] for k in CLASSIFICATION_KEYS}


def to_item(row: dict[str, Any]) -> dict[str, Any]:
    """A core.disclosures row → the DisclosureListItem document (pure)."""
    ticker = row["primary_ticker"]
    return {
        **{k: row[k] for k in row if k not in ("classification", "stock_codes", "related_stocks")},
        "disclosure_oid": row["disclosure_oid"] or str(row["disclosure_index"]),
        "stock_codes": _codes(row["stock_codes"]),
        "related_stocks": _codes(row["related_stocks"]),
        "primary_ticker": ticker if ticker and TICKER_SHAPE.fullmatch(ticker) else None,
        "first_seen_at": row["first_seen_at"] or row["available_at"],
        "classification": _classification(row["classification"]),
    }


def day_bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time(0, 0), IST)
    return start, start + timedelta(days=1)


async def list_disclosures(
    conn: AsyncConnection[Any], day: date, *, demo: bool, limit: int = 200, ticker: str | None = None
) -> list[dict[str, Any]]:
    start, end = day_bounds(day)
    params = {
        "demo": demo,
        "start": start,
        "end": end,
        "ticker": ticker,
        "limit": max(1, min(limit, MAX_LIMIT)),
    }
    async with conn.cursor() as cur:
        await cur.execute(LIST_SQL, params)
        rows = await cur.fetchall()
    return [to_item(dict(r)) for r in rows]
