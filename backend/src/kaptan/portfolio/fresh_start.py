"""Start over ("Baştan başla"): the person tried KAPtan with a pretend amount and now starts with the real one.

One action closes the current book and opens an empty one, so the app is `needs_setup` again. Nothing is deleted
from history: the old book's ledger rows stay (they carry their `book_no`), its open positions, P&L series and
tickets are copied into `trading.book_archive` before the live tables are emptied, and `GET /me/books` reads them
back. Untouched: disclosures, KAPtan's reading, the limits, the audit chain, the closed-position history. The risk
numbers (the day's change, the fall from the peak) are computed from the book, so they start from zero with it.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.api.deps import Actor
from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append
from kaptan.domain.schemas._base import iso_ms
from kaptan.portfolio import ledger
from kaptan.risk.book import own_book
from kaptan.text.turkish import tr_lower

CONFIRM_WORD: Final = "baştan"
NOT_STARTED: Final = "Başlangıç paranı henüz girmedin; baştan başlayacak bir şey yok."
WRONG_WORD: Final = 'Onay kelimesini yanlış yazdın. "baştan" yaz.'
VOID_NOTE: Final = "Baştan başla ile kapandı."

ARCHIVE_POSITIONS_SQL: Final = """
INSERT INTO trading.book_archive (book_no, kind, doc)
SELECT %s, 'position', jsonb_build_object('ticker', ticker, 'qty', qty, 'avg_cost', avg_cost, 'origin', origin,
                                            'opened_at', opened_at)
  FROM trading.positions ORDER BY id
"""
ARCHIVE_PNL_SQL: Final = """
INSERT INTO trading.book_archive (book_no, kind, doc)
SELECT %s, 'pnl', jsonb_build_object('d', d, 'strategy', strategy, 'equity', equity, 'peak_equity', peak_equity)
  FROM trading.pnl_daily ORDER BY ord
"""
ARCHIVE_TICKETS_SQL: Final = """
INSERT INTO trading.book_archive (book_no, kind, doc)
SELECT %s, 'ticket', jsonb_build_object('ticket_no', ticket_no, 'status', entry_status, 'qty', filled_qty,
                                          'price', avg_price)
  FROM trading.order_tickets WHERE entry_status IN ('entered', 'awaiting', 'expired') ORDER BY created_at
"""
VOID_SQL: Final = """
UPDATE trading.order_tickets SET entry_status = 'canceled', marked_at = %s, note = %s
 WHERE entry_status IN ('awaiting', 'expired') AND marked_at IS NULL
"""
CLOSE_SQL: Final = """
UPDATE trading.book_epochs SET closed_at = %s, cash_at_close = %s, equity_at_close = %s, put_in_at_close = %s
 WHERE no = %s
"""
OPEN_SQL: Final = "INSERT INTO trading.book_epochs (no, opened_at) VALUES (%s, %s)"
BOOKS_SQL: Final = """
SELECT no, opened_at, closed_at, cash_at_close, equity_at_close, put_in_at_close FROM trading.book_epochs
 WHERE closed_at IS NOT NULL ORDER BY no DESC
"""
HELD_SQL: Final = """
SELECT doc->>'ticker' AS ticker, (doc->>'qty')::int AS qty, (doc->>'avg_cost')::float AS avg_cost
  FROM trading.book_archive WHERE book_no = %s AND kind = 'position' ORDER BY id
"""
STARTED_WITH_SQL: Final = """
SELECT coalesce((SELECT c.amount_try FROM trading.book_ledger c WHERE c.corrects_id = l.id AND c.kind = 'correction'
                  ORDER BY c.id DESC LIMIT 1), l.amount_try) AS amount
  FROM trading.book_ledger l WHERE l.kind = 'start' AND l.book_no = %s
"""


def confirmed(word: str) -> bool:
    return tr_lower(word.strip()) == CONFIRM_WORD


async def _rows(conn: AsyncConnection[Any], sql: str, params: Any) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return [dict(r) for r in await cur.fetchall()]


async def start_over(conn: AsyncConnection[Any], word: str, actor: Actor, *, now: datetime) -> dict[str, Any]:
    """POST /me/book/reset {confirm}. 409 not_started, 422 confirm. Returns {closed_book}."""
    if not confirmed(word):
        raise ApiError(422, "confirm", WRONG_WORD)
    async with conn.transaction():
        await ledger.lock(conn)
        book = await own_book(conn, now)
        if not book.started:
            raise ApiError(409, "not_started", NOT_STARTED)
        no = await ledger.current_book_no(conn)
        async with conn.cursor() as cur:
            for sql in (ARCHIVE_POSITIONS_SQL, ARCHIVE_PNL_SQL, ARCHIVE_TICKETS_SQL):
                await cur.execute(sql, (no,))
            await cur.execute("SELECT count(*) AS n FROM trading.positions")
            positions = int((await cur.fetchone() or {"n": 0})["n"])
            await cur.execute(VOID_SQL, (now, VOID_NOTE))
            voided = cur.rowcount
            await cur.execute(CLOSE_SQL, (now, book.cash, book.equity, book.put_in, no))
            await cur.execute(OPEN_SQL, (no + 1, now))
            await cur.execute("DELETE FROM trading.positions")
            await cur.execute("DELETE FROM trading.pnl_daily")
        payload = {
            "closed_book": no, "equity": float(book.equity), "cash": float(book.cash), "put_in": float(book.put_in),
            "positions": positions, "tickets_voided": voided,
        }  # fmt: skip
        draft = AuditDraft(actor.audit_actor, "book.reset", "book", f"defter-{no}", payload, occurred_at=now)
        await append(conn, [draft], now=now)
    return {"closed_book": no}


async def previous_books(conn: AsyncConnection[Any]) -> list[dict[str, Any]]:
    """PreviousBook[]: every closed book, newest first, with its movements and the shares it held at the end."""
    out: list[dict[str, Any]] = []
    for b in await _rows(conn, BOOKS_SQL, ()):
        started = await _rows(conn, STARTED_WITH_SQL, (b["no"],))
        held = await _rows(conn, HELD_SQL, (b["no"],))
        out.append(
            {
                "no": int(b["no"]),
                "opened_at": iso_ms(b["opened_at"]),
                "closed_at": iso_ms(b["closed_at"]),
                "started_with": float(started[0]["amount"]) if started else 0.0,
                "put_in": float(b["put_in_at_close"]),
                "cash": float(b["cash_at_close"]),
                "equity": float(b["equity_at_close"]),
                "movements": await ledger.movements(conn, int(b["no"])),
                "positions": [{"ticker": h["ticker"], "qty": h["qty"], "avg_cost": h["avg_cost"]} for h in held],
            }
        )
    return out


__all__ = ["CONFIRM_WORD", "confirmed", "previous_books", "start_over"]
