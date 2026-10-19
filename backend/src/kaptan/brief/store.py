"""ops.morning_briefs (migration 0018): one MorningBrief document per Istanbul day."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.brief.build import build_brief

UPSERT_SQL: Final = """
INSERT INTO ops.morning_briefs (d, generated_at, doc) VALUES (%s, %s, %s)
ON CONFLICT (d) DO UPDATE SET generated_at = EXCLUDED.generated_at, doc = EXCLUDED.doc
"""
GET_SQL: Final = "SELECT doc FROM ops.morning_briefs WHERE d = %s"


async def save_brief(conn: AsyncConnection[Any], day: date, now: datetime, doc: dict[str, Any]) -> None:
    await conn.execute(UPSERT_SQL, (day, now, Jsonb(doc)))


async def get_brief(conn: AsyncConnection[Any], day: date) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(GET_SQL, (day,))
        row = await cur.fetchone()
    if row is None:
        return None
    doc = row["doc"] if isinstance(row, dict) else row[0]
    return dict(doc)


async def run_morning_brief(
    conn: AsyncConnection[Any], day: date, now: datetime, *, live_marks: bool = False
) -> dict[str, Any]:
    """Build and store `day`'s brief (idempotent: a re-run replaces it). Returns a small summary."""
    doc = await build_brief(conn, day, now, live_marks=live_marks)
    await save_brief(conn, day, now, doc)
    return {
        "date": doc["date"],
        "disclosures": len(doc["important_disclosures"]),
        "orders_for_open": len(doc["orders_for_open"]),
        "pending_approvals": len(doc["pending_approvals"]),
        "open_positions": len(doc["open_positions"]),
        "warnings": len(doc["risk_warnings"]),
    }
