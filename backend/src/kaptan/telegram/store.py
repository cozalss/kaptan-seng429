"""Telegram's tables (migration 0039): the link, the queue, what was sent, and when the workers were last alive.

The bot token lives in `ops.telegram.token`, readable by the app role only. It is never returned by the API, never
logged. (KAPtan has no secret-box helper, so it is not encrypted at rest; `ALERT_TELEGRAM_BOT_TOKEN` in `.env`
is the other way to give it, and wins when set.)
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timedelta
from typing import Any, Final

from kaptan.db import DictConn

LEVELS: Final = ("less", "normal", "more")
DEFAULT_CAP: Final = 8
GAP_MIN: Final = timedelta(minutes=30)

STATE_SQL: Final = "SELECT * FROM ops.telegram WHERE id = 1"


async def get_state(conn: DictConn) -> dict[str, Any]:
    cur = await conn.execute(STATE_SQL)
    row = await cur.fetchone()
    if row is None:
        await conn.execute("INSERT INTO ops.telegram (id) VALUES (1) ON CONFLICT (id) DO NOTHING")
        cur = await conn.execute(STATE_SQL)
        row = await cur.fetchone()
    assert row is not None
    return dict(row)


async def update(conn: DictConn, now: datetime, **fields: Any) -> None:
    """Set some columns of the one row (column names come from this package, never from a request)."""
    if not fields:
        return
    cols = ", ".join(f"{k} = %({k})s" for k in fields)
    await conn.execute(f"UPDATE ops.telegram SET {cols}, updated_at = %(_now)s WHERE id = 1", {**fields, "_now": now})  # noqa: S608


async def unlink(conn: DictConn, now: datetime) -> None:
    """Bağlantıyı kaldır: no chat, no code, no stored token. The offset stays (old updates are not replayed)."""
    await update(
        conn, now, token=None, bot_username=None, chat_id=None, pair_code_hash=None, pair_expires_at=None,
        paired_at=None, silent_until=None,
    )  # fmt: skip


# ── the queue ─────────────────────────────────────────────────────────────────


async def known_indexes(conn: DictConn, indexes: Iterable[int]) -> set[int]:
    ids = list(indexes)
    if not ids:
        return set()
    cur = await conn.execute("SELECT disclosure_index FROM ops.telegram_queue WHERE disclosure_index = ANY(%s)", (ids,))
    return {int(r["disclosure_index"]) for r in await cur.fetchall()}


async def enqueue(
    conn: DictConn, index: int, ticker: str | None, company: str, state: str, reason: str | None, now: datetime
) -> None:
    await conn.execute(
        "INSERT INTO ops.telegram_queue (disclosure_index, ticker, company, state, reason, created_at)"
        " VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (disclosure_index) DO NOTHING",
        (index, ticker, company, state, reason, now),
    )


async def rows_in(conn: DictConn, state: str) -> list[dict[str, Any]]:
    cur = await conn.execute(
        "SELECT * FROM ops.telegram_queue WHERE state = %s ORDER BY created_at, disclosure_index", (state,)
    )
    return [dict(r) for r in await cur.fetchall()]


async def move(conn: DictConn, indexes: Iterable[int], state: str, reason: str | None, now: datetime) -> None:
    ids = list(indexes)
    if not ids:
        return
    done = now if state == "done" else None
    await conn.execute(
        "UPDATE ops.telegram_queue SET state = %s, reason = %s, sent_at = %s WHERE disclosure_index = ANY(%s)",
        (state, reason, done, ids),
    )


# ── what was sent ─────────────────────────────────────────────────────────────


async def record_sent(conn: DictConn, now: datetime, kind: str, tickers: Iterable[str], n: int) -> None:
    await conn.execute(
        "INSERT INTO ops.telegram_sent (sent_at, kind, tickers, n) VALUES (%s, %s, %s, %s)",
        (now, kind, sorted(set(tickers)), n),
    )


async def instant_count(conn: DictConn, start: datetime, end: datetime) -> int:
    cur = await conn.execute(
        "SELECT count(*) AS n FROM ops.telegram_sent WHERE kind = 'instant' AND sent_at >= %s AND sent_at < %s",
        (start, end),
    )
    row = await cur.fetchone()
    return int(row["n"]) if row else 0


async def last_instant(conn: DictConn, ticker: str) -> datetime | None:
    cur = await conn.execute(
        "SELECT max(sent_at) AS at FROM ops.telegram_sent WHERE kind = 'instant' AND %s = ANY(tickers)", (ticker,)
    )
    row = await cur.fetchone()
    return row["at"] if row else None


async def last_sent(conn: DictConn, kind: str) -> datetime | None:
    cur = await conn.execute("SELECT max(sent_at) AS at FROM ops.telegram_sent WHERE kind = %s", (kind,))
    row = await cur.fetchone()
    return row["at"] if row else None


async def counts_between(conn: DictConn, start: datetime, end: datetime) -> dict[str, int]:
    cur = await conn.execute(
        "SELECT kind, count(*) AS n FROM ops.telegram_sent WHERE sent_at >= %s AND sent_at < %s GROUP BY kind",
        (start, end),
    )
    return {str(r["kind"]): int(r["n"]) for r in await cur.fetchall()}


# ── the workers were alive ────────────────────────────────────────────────────


async def touch_alive(conn: DictConn, now: datetime) -> tuple[datetime, datetime] | None:
    """Stamp "alive now". When the previous stamp is more than 30 minutes old that was a gap: it is remembered
    (`gap_from`, `gap_to`, not yet told) and returned. Called once at start-up and then every minute."""
    cur = await conn.execute("SELECT last_alive_at FROM ops.worker_alive WHERE id = 1")
    row = await cur.fetchone()
    last = row["last_alive_at"] if row else None
    gap = (last, now) if last is not None and now - last > GAP_MIN else None
    if gap is not None:
        await conn.execute(
            "UPDATE ops.worker_alive SET last_alive_at = %s, gap_from = %s, gap_to = %s, gap_told = false WHERE id = 1",
            (now, gap[0], gap[1]),
        )
    elif row is None:
        await conn.execute("INSERT INTO ops.worker_alive (id, last_alive_at) VALUES (1, %s)", (now,))
    else:
        await conn.execute("UPDATE ops.worker_alive SET last_alive_at = %s WHERE id = 1", (now,))
    return gap


async def last_gap(conn: DictConn) -> dict[str, Any] | None:
    """The latest gap {from, to, hours, told} for the morning brief (None: the workers never stopped for long)."""
    cur = await conn.execute("SELECT gap_from, gap_to, gap_told FROM ops.worker_alive WHERE id = 1")
    row = await cur.fetchone()
    if row is None or row["gap_from"] is None or row["gap_to"] is None:
        return None
    hours = (row["gap_to"] - row["gap_from"]).total_seconds() / 3600
    return {"from": row["gap_from"], "to": row["gap_to"], "hours": round(hours, 1), "told": bool(row["gap_told"])}


async def mark_gap_told(conn: DictConn) -> None:
    await conn.execute("UPDATE ops.worker_alive SET gap_told = true WHERE id = 1")
