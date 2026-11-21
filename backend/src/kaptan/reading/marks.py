"""Saved ("sonra oku") and read marks on KAP disclosures.

These are the person's own bookmarks, not money: no audit record is written. A disclosure counts as unread when it
belongs to a company the person stars or holds, is not noise, was published after `read_through` and was not opened
since. "Hepsini okundu say" moves `read_through` to now (never backwards).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from kaptan.api.errors import ApiError
from kaptan.db import DictConn
from kaptan.disclosures.listing import LIST_ITEM_COLUMNS, to_item
from kaptan.reference._sql import execute, fetch_all, fetch_one

UNREAD_CAP: Final = 500
SAVED_LIMIT: Final = 200

EXISTS_SQL: Final = "SELECT 1 AS ok FROM core.disclosures WHERE disclosure_index = %s"
THROUGH_SQL: Final = "SELECT read_through FROM core.reading_state WHERE id = 1"
UNREAD_SQL: Final = """
SELECT d.disclosure_index FROM core.disclosures d
 WHERE d.published_at > %(through)s AND NOT d.is_noise
   AND NOT EXISTS (SELECT 1 FROM core.disclosure_read r WHERE r.disclosure_index = d.disclosure_index)
   AND (d.primary_ticker IN (SELECT ticker FROM core.watchlist UNION SELECT ticker FROM trading.positions)
        OR d.stock_codes && ARRAY(SELECT ticker FROM core.watchlist UNION SELECT ticker FROM trading.positions))
 ORDER BY d.published_at DESC, d.disclosure_index DESC
"""
SAVED_IDS_SQL: Final = "SELECT disclosure_index FROM core.disclosure_saved ORDER BY saved_at DESC"
SAVED_LIST_SQL: Final = f"""
SELECT {LIST_ITEM_COLUMNS} FROM core.disclosures d
  JOIN core.disclosure_saved s USING (disclosure_index)
 ORDER BY s.saved_at DESC LIMIT %s
"""  # noqa: S608
SET_THROUGH_SQL: Final = """
INSERT INTO core.reading_state (id, read_through) VALUES (1, %s)
ON CONFLICT (id) DO UPDATE SET read_through = greatest(core.reading_state.read_through, excluded.read_through)
"""


async def _through(conn: DictConn, now: datetime) -> datetime:
    row = await fetch_one(conn, THROUGH_SQL)
    if row is not None:
        return row["read_through"]  # type: ignore[no-any-return]
    await execute(
        conn, "INSERT INTO core.reading_state (id, read_through) VALUES (1, %s) ON CONFLICT (id) DO NOTHING", (now,)
    )
    return now


async def reading_state(conn: DictConn, now: datetime) -> dict[str, Any]:
    through = await _through(conn, now)
    unread = [int(r["disclosure_index"]) for r in await fetch_all(conn, UNREAD_SQL, {"through": through})]
    saved = [int(r["disclosure_index"]) for r in await fetch_all(conn, SAVED_IDS_SQL)]
    return {
        "read_through": through,
        "unread": len(unread),
        "unread_indexes": unread[:UNREAD_CAP],
        "saved_indexes": saved,
    }


async def _require(conn: DictConn, index: int) -> None:
    if await fetch_one(conn, EXISTS_SQL, (index,)) is None:
        raise ApiError(404, "not_found", "Bu bildirimi bulamadım.")


async def set_saved(conn: DictConn, index: int, *, saved: bool, now: datetime) -> None:
    """Star or un-star one disclosure. Doing it twice changes nothing."""
    async with conn.transaction():
        if saved:
            await _require(conn, index)
            await execute(
                conn,
                "INSERT INTO core.disclosure_saved (disclosure_index, saved_at) VALUES (%s, %s)"
                " ON CONFLICT (disclosure_index) DO NOTHING",
                (index, now),
            )
        else:
            await execute(conn, "DELETE FROM core.disclosure_saved WHERE disclosure_index = %s", (index,))


async def mark_read(conn: DictConn, index: int, *, now: datetime) -> None:
    """One disclosure was opened: it stops counting as unread."""
    async with conn.transaction():
        await _require(conn, index)
        await execute(
            conn,
            "INSERT INTO core.disclosure_read (disclosure_index, read_at) VALUES (%s, %s)"
            " ON CONFLICT (disclosure_index) DO NOTHING",
            (index, now),
        )


async def read_all(conn: DictConn, *, now: datetime) -> None:
    """Everything up to now counts as read; the single marks below it are no longer needed."""
    async with conn.transaction():
        await execute(conn, SET_THROUGH_SQL, (now,))
        await execute(conn, "DELETE FROM core.disclosure_read WHERE read_at <= %s", (now,))


async def saved_disclosures(conn: DictConn) -> list[dict[str, Any]]:
    rows = await fetch_all(conn, SAVED_LIST_SQL, (SAVED_LIMIT,))
    return [to_item(dict(r)) for r in rows]
