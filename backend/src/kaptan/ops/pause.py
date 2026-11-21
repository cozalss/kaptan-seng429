"""Tatil modu: KAPtan reads and stores disclosures but starts no agent run and makes no suggestion until a time.

`ops.preferences.pause_until` is the whole state: in the future = paused. The agent feed asks `paused_until`
before it spends anything (kaptan.agents.feed, deferral reason `paused`), the rows that waited are re-driven by
the first sweep after the end, and a stop or an exit never reads it: those do not go through the feed.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, Final

from psycopg import AsyncConnection

from kaptan.domain.schemas._base import iso_ms
from kaptan.text.turkish import IST

PAUSED: Final = "paused"
MAX_DAYS: Final = 90

PAST: Final = "Bu tarih geçmişte. Bugünden sonraki bir tarih seç."
TOO_FAR: Final = f"En fazla {MAX_DAYS} gün ara verilebilir."


class PauseError(ValueError):
    """The requested end is not allowed; the message is Turkish and shown as is."""


async def paused_until(conn: AsyncConnection[Any], now: datetime) -> datetime | None:
    async with conn.cursor() as cur:
        await cur.execute("SELECT pause_until FROM ops.preferences WHERE id = 1 AND pause_until > %s", (now,))
        row = await cur.fetchone()
    if row is None:
        return None
    value = row["pause_until"] if isinstance(row, dict) else row[0]
    return value if isinstance(value, datetime) else None


def end_of_pause(now: datetime, *, days: int | None, until: date | None) -> datetime:
    """`days` days from now, or 00:00 Istanbul of `until` (the first day KAPtan works again)."""
    if days is not None:
        end = now + timedelta(days=days)
    elif until is not None:
        end = datetime.combine(until, time(0, 0), IST)
    else:
        raise PauseError("Kaç gün ya da hangi tarihe kadar olduğunu yaz.")
    if end <= now:
        raise PauseError(PAST)
    if end - now > timedelta(days=MAX_DAYS):
        raise PauseError(TOO_FAR)
    return end


async def start_pause(conn: AsyncConnection[Any], now: datetime, end: datetime) -> None:
    await conn.execute(
        "UPDATE ops.preferences SET pause_until = %s, pause_since = %s, updated_at = %s WHERE id = 1",
        (end, now, now),
    )


async def end_pause(conn: AsyncConnection[Any], now: datetime) -> bool:
    """True when a pause was running and is over now."""
    was = await paused_until(conn, now)
    await conn.execute(
        "UPDATE ops.preferences SET pause_until = NULL, pause_since = NULL, updated_at = %s WHERE id = 1", (now,)
    )
    return was is not None


async def pause_doc(conn: AsyncConnection[Any], now: datetime) -> dict[str, Any]:
    """The Pause document. An ended pause reads as not active."""
    async with conn.cursor() as cur:
        await cur.execute("SELECT pause_until, pause_since FROM ops.preferences WHERE id = 1")
        row = await cur.fetchone()
    until = None if row is None else (row["pause_until"] if isinstance(row, dict) else row[0])
    since = None if row is None else (row["pause_since"] if isinstance(row, dict) else row[1])
    if not isinstance(until, datetime) or until <= now:
        return {"active": False, "until": None, "since": None}
    return {"active": True, "until": iso_ms(until), "since": iso_ms(since) if isinstance(since, datetime) else None}
