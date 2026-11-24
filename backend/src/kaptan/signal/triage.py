"""Where the person put an important disclosure: act, read later, done (their own bookmarks, not money: no audit).

One row per disclosure in `core.disclosure_triage`. "sonra" is the old "sonra oku" star (same table, no second
concept). Any state counts as handled: the disclosure stops counting as unread.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final, Literal, get_args

from kaptan.api.errors import ApiError
from kaptan.reference._sql import execute, fetch_all, fetch_one

TriageState = Literal["yapilacak", "sonra", "tamam"]
STATES: Final = frozenset(get_args(TriageState))
TRIAGE_LIST_CAP: Final = 500

EXISTS_SQL: Final = "SELECT 1 AS ok FROM core.disclosures WHERE disclosure_index = %s"
UPSERT_SQL: Final = """
INSERT INTO core.disclosure_triage (disclosure_index, state, set_at) VALUES (%s, %s, %s)
ON CONFLICT (disclosure_index) DO UPDATE SET state = excluded.state, set_at = excluded.set_at
"""
LIST_SQL: Final = (
    f"SELECT disclosure_index, state FROM core.disclosure_triage ORDER BY set_at DESC LIMIT {TRIAGE_LIST_CAP}"  # noqa: S608
)


async def set_state(conn: Any, index: int, state: TriageState | None, *, now: datetime) -> None:
    """Put one disclosure in a state (None takes it out). Doing it twice changes nothing."""
    if state is not None and state not in STATES:
        raise ApiError(422, "validation", "Bilinmeyen durum.")
    async with conn.transaction():
        if state is None:
            await execute(conn, "DELETE FROM core.disclosure_triage WHERE disclosure_index = %s", (index,))
            return
        if await fetch_one(conn, EXISTS_SQL, (index,)) is None:
            raise ApiError(404, "not_found", "Bu bildirimi bulamadım.")
        await execute(conn, UPSERT_SQL, (index, state, now))
        await execute(
            conn,
            "INSERT INTO core.disclosure_read (disclosure_index, read_at) VALUES (%s, %s)"
            " ON CONFLICT (disclosure_index) DO NOTHING",
            (index, now),
        )


async def marks(conn: Any) -> list[dict[str, Any]]:
    return [
        {"disclosure_index": int(r["disclosure_index"]), "state": r["state"]} for r in await fetch_all(conn, LIST_SQL)
    ]
