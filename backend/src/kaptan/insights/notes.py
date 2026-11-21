"""The person's private note per share ("neden aldım", "ne zaman satarım"), 3 to 500 characters.

One note per ticker, kept on this computer only. Saving or clearing one is audited in the same transaction
(`note.saved` / `note.cleared`: the audit carries the ticker, the company and the length, not the text). A note is
no money write and moves nothing in the book. Only a share that is in the book can have one.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.api.deps import Actor
from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append, user_actor
from kaptan.domain.schemas._base import iso_ms

NOT_IN_BOOK: Final = "Bu hisse defterinde yok."
NO_NOTE: Final = "Bu hisse için yazılmış bir not yok."
LIST_SQL: Final = """
SELECT n.ticker, coalesce(i.name, n.ticker) AS company, n.body, n.updated_at
  FROM trading.holding_notes n LEFT JOIN core.issuers i ON i.ticker = n.ticker ORDER BY n.updated_at DESC
"""
EVER_SQL: Final = """
SELECT EXISTS (SELECT 1 FROM trading.book_ledger WHERE ticker = %s
                  AND book_no = (SELECT max(no) FROM trading.book_epochs)) AS ever
"""
NAME_SQL: Final = "SELECT name FROM core.issuers WHERE ticker = %s"
UPSERT_SQL: Final = """
INSERT INTO trading.holding_notes (ticker, body, created_at, updated_at) VALUES (%s, %s, %s, %s)
ON CONFLICT (ticker) DO UPDATE SET body = EXCLUDED.body, updated_at = EXCLUDED.updated_at
"""
DELETE_SQL: Final = "DELETE FROM trading.holding_notes WHERE ticker = %s RETURNING ticker"


async def list_notes(conn: AsyncConnection[Any]) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(LIST_SQL)
        rows = await cur.fetchall()
    return {
        "notes": [
            {"ticker": r["ticker"], "company": r["company"], "body": r["body"], "updated_at": iso_ms(r["updated_at"])}
            for r in rows
        ]
    }


async def _company(conn: AsyncConnection[Any], ticker: str) -> str:
    async with conn.cursor() as cur:
        await cur.execute(NAME_SQL, (ticker,))
        row = await cur.fetchone()
    return ticker if row is None else str(row["name"])


async def save_note(conn: AsyncConnection[Any], ticker: str, body: str, actor: Actor, now: datetime) -> dict[str, Any]:
    text = body.strip()
    async with conn.transaction():
        async with conn.cursor() as cur:
            await cur.execute(EVER_SQL, (ticker,))
            row = await cur.fetchone()
        if row is None or not row["ever"]:
            raise ApiError(404, "not_in_book", NOT_IN_BOOK)
        await conn.execute(UPSERT_SQL, (ticker, text, now, now))
        payload = {"ticker": ticker, "company": await _company(conn, ticker), "chars": len(text)}
        await append(conn, [AuditDraft(user_actor(actor.uid), "note.saved", "note", ticker, payload)])
    return await list_notes(conn)


async def clear_note(conn: AsyncConnection[Any], ticker: str, actor: Actor) -> dict[str, Any]:
    async with conn.transaction():
        async with conn.cursor() as cur:
            await cur.execute(DELETE_SQL, (ticker,))
            gone = await cur.fetchone()
        if gone is None:
            raise ApiError(404, "no_note", NO_NOTE)
        payload = {"ticker": ticker, "company": await _company(conn, ticker)}
        await append(conn, [AuditDraft(user_actor(actor.uid), "note.cleared", "note", ticker, payload)])
    return await list_notes(conn)
