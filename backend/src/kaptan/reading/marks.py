"""Saved ("sonra oku") and read marks on KAP disclosures.

These are the person's own bookmarks, not money: no audit record is written. A disclosure counts as unread when it
is important (`kaptan.signal`: the digest's meaning; noise and archive-only never are), belongs to a company the
person stars or holds, was published after `read_through` and was neither opened nor put in a triage state. The
important ones of other companies are counted apart (`unread_other`). "Hepsini okundu say" (with the important
ones) moves `read_through` to now (never backwards); its "Geri al" puts the earlier mark back (`restore_through`,
only backwards). Single "opened" marks survive it until a later one makes them redundant, so an undo never
brings back a disclosure the person had opened.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Final

from kaptan.api.errors import ApiError
from kaptan.db import DictConn
from kaptan.disclosures.listing import LIST_ITEM_COLUMNS, to_item
from kaptan.reference._sql import execute, fetch_all, fetch_one
from kaptan.signal import Signal, signals_between
from kaptan.signal.triage import marks as triage_marks
from kaptan.signal.triage import set_state

UNREAD_CAP: Final = 500
#: The old unread rule had no upper bound (a disclosure stamped after `now` still counted); keep it so.
NO_UPPER_BOUND: Final = timedelta(days=3650)
SAVED_LIMIT: Final = 200

EXISTS_SQL: Final = "SELECT 1 AS ok FROM core.disclosures WHERE disclosure_index = %s"
THROUGH_SQL: Final = "SELECT read_through FROM core.reading_state WHERE id = 1"
HANDLED_SQL: Final = """
SELECT disclosure_index FROM core.disclosure_read WHERE disclosure_index = ANY(%(ids)s)
UNION SELECT disclosure_index FROM core.disclosure_triage WHERE disclosure_index = ANY(%(ids)s)
"""
SAVED_IDS_SQL: Final = "SELECT disclosure_index FROM core.disclosure_triage WHERE state = 'sonra' ORDER BY set_at DESC"
SAVED_LIST_SQL: Final = f"""
SELECT {LIST_ITEM_COLUMNS} FROM core.disclosures d
  JOIN core.disclosure_triage s USING (disclosure_index)
 WHERE s.state = 'sonra'
 ORDER BY s.set_at DESC LIMIT %s
"""  # noqa: S608
SET_THROUGH_SQL: Final = """
INSERT INTO core.reading_state (id, read_through) VALUES (1, %s)
ON CONFLICT (id) DO UPDATE SET read_through = greatest(core.reading_state.read_through, excluded.read_through)
"""

PRUNE_READ_SQL: Final = """
DELETE FROM core.disclosure_read r USING core.disclosures d
 WHERE d.disclosure_index = r.disclosure_index AND d.published_at <= %s
"""


async def _through(conn: DictConn, now: datetime) -> datetime:
    row = await fetch_one(conn, THROUGH_SQL)
    if row is not None:
        return row["read_through"]  # type: ignore[no-any-return]
    await execute(
        conn, "INSERT INTO core.reading_state (id, read_through) VALUES (1, %s) ON CONFLICT (id) DO NOTHING", (now,)
    )
    return now


async def unread_signals(conn: DictConn, through: datetime, now: datetime) -> list[Signal]:
    """The important disclosures since `through` that were not opened and not put anywhere, newest first.

    Noise and archive-only disclosures are never here: they are read the moment they arrive.
    """
    found = await signals_between(conn, through, now + NO_UPPER_BOUND, only_important=True, now=now)
    if not found:
        return []
    ids = [s.disclosure_index for s in found]
    handled = {int(r["disclosure_index"]) for r in await fetch_all(conn, HANDLED_SQL, {"ids": ids})}
    return [s for s in found if s.disclosure_index not in handled]


async def reading_state(conn: DictConn, now: datetime) -> dict[str, Any]:
    through = await _through(conn, now)
    unread = await unread_signals(conn, through, now)
    mine = [s.disclosure_index for s in unread if s.mine is not None]
    saved = [int(r["disclosure_index"]) for r in await fetch_all(conn, SAVED_IDS_SQL)]
    marks = await triage_marks(conn)
    return {
        "read_through": through,
        "unread": len(mine),
        "unread_other": len(unread) - len(mine),
        "unread_indexes": mine[:UNREAD_CAP],
        "saved_indexes": saved,
        "triage": marks,
        "act_count": sum(1 for m in marks if m["state"] == "yapilacak"),
    }


async def _require(conn: DictConn, index: int) -> None:
    if await fetch_one(conn, EXISTS_SQL, (index,)) is None:
        raise ApiError(404, "not_found", "Bu bildirimi bulamadım.")


async def set_saved(conn: DictConn, index: int, *, saved: bool, now: datetime) -> None:
    """Star or un-star one disclosure: "sonra oku" is the triage state `sonra`. Doing it twice changes nothing."""
    if saved:
        await set_state(conn, index, "sonra", now=now)
        return
    async with conn.transaction():
        await execute(
            conn, "DELETE FROM core.disclosure_triage WHERE disclosure_index = %s AND state = 'sonra'", (index,)
        )


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


async def read_all(conn: DictConn, *, now: datetime, important: bool = False) -> None:
    """ "Hepsini okundu say". Noise and archive-only disclosures are read from the start, so the plain call clears
    nothing that counts; with `important` everything up to now counts as read. Single marks under the previous
    mark are no longer needed by any undo."""
    if not important:
        return
    async with conn.transaction():
        before = await _through(conn, now)
        await execute(conn, SET_THROUGH_SQL, (now,))
        await execute(conn, PRUNE_READ_SQL, (before,))


async def restore_through(conn: DictConn, through: datetime, *, now: datetime) -> None:
    """The "Geri al" of "Hepsini okundu say": the mark goes back to `through`. It never moves forward or past now."""
    if through > now:
        raise ApiError(422, "validation", "Bu an henüz gelmedi.")
    async with conn.transaction():
        await _through(conn, now)
        await execute(
            conn, "UPDATE core.reading_state SET read_through = least(read_through, %s) WHERE id = 1", (through,)
        )


async def saved_disclosures(conn: DictConn) -> list[dict[str, Any]]:
    rows = await fetch_all(conn, SAVED_LIST_SQL, (SAVED_LIMIT,))
    return [to_item(dict(r)) for r in rows]
