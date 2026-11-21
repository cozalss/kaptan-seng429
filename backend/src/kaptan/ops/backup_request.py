"""The panel's backup box: when was the last backup, and "Şimdi yedek al".

The backup container (`ops/backup-loop.sh`) looks at `ops.backup_request` every 15 seconds. The API only writes
`requested_at`; the loop stamps `started_at`, runs `ops/backup-once.sh` (which also writes the `backup` row of
`ops.job_runs`, trigger `manual`) and stamps `finished_at` and `ok`. The last backup and its result are read from
`ops.job_runs`, the same fact `/system/status` reads.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Final, Literal

from psycopg import AsyncConnection

from kaptan.domain.schemas._base import iso_ms

State = Literal["idle", "waiting", "running"]

#: A request nobody picked up within this long means the backup service is not running.
PICKUP_GRACE: Final = timedelta(minutes=2)
#: Beyond these an old request is forgotten (a crashed container must not show "running" for ever).
WAIT_FORGET: Final = timedelta(minutes=15)
RUN_FORGET: Final = timedelta(minutes=30)

LAST_SQL: Final = """
SELECT (SELECT max(finished_at) FROM ops.job_runs WHERE job = 'backup' AND ok) AS last_ok_at,
       (SELECT ok FROM ops.job_runs WHERE job = 'backup' AND finished_at IS NOT NULL
         ORDER BY finished_at DESC LIMIT 1) AS last_ok,
       r.requested_at, r.started_at, r.finished_at, r.ok AS request_ok
  FROM ops.backup_request r WHERE r.id = 1
"""

MSG_WAITING: Final = "Yedek isteğin alındı; birkaç saniye içinde başlar."
MSG_NO_SERVICE: Final = "Yedek isteğin bekliyor ama yedek servisi yanıt vermiyor. KAPtan’ı yeniden başlatmayı dene."
MSG_RUNNING: Final = "Yedek alınıyor. Bu bir iki dakika sürebilir."
MSG_NEVER: Final = "Henüz yedek alınmadı."
MSG_FAILED: Final = "Son yedek alınamadı. Yedek klasörünün yerinde olduğunu kontrol et."
MSG_DONE: Final = "Yedek hazır."


def _state(row: dict[str, Any], now: datetime) -> State:
    requested, started, finished = row["requested_at"], row["started_at"], row["finished_at"]
    if requested is None or finished is not None:
        return "idle"
    if started is None:
        return "waiting" if now - requested < WAIT_FORGET else "idle"
    return "running" if now - started < RUN_FORGET else "idle"


def _message(row: dict[str, Any], state: State, now: datetime) -> str:
    if state == "running":
        return MSG_RUNNING
    if state == "waiting":
        return MSG_WAITING if now - row["requested_at"] < PICKUP_GRACE else MSG_NO_SERVICE
    if row["last_ok"] is False:
        return MSG_FAILED
    if row["last_ok_at"] is None:
        return MSG_NEVER
    return MSG_DONE


async def backup_status(conn: AsyncConnection[Any], now: datetime, folder: str | None) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(LAST_SQL)
        raw = await cur.fetchone()
    row: dict[str, Any] = dict(raw) if raw else {}
    for key in ("last_ok_at", "last_ok", "requested_at", "started_at", "finished_at"):
        row.setdefault(key, None)
    state = _state(row, now)
    last_ok_at: datetime | None = row["last_ok_at"]
    return {
        "state": state,
        "last_at": iso_ms(last_ok_at) if last_ok_at else None,
        "last_ok": row["last_ok"],
        "requested_at": iso_ms(row["requested_at"]) if state != "idle" and row["requested_at"] else None,
        "folder": folder,
        "message_tr": _message(row, state, now),
    }


async def request_backup(conn: AsyncConnection[Any], now: datetime) -> bool:
    """Ask for a backup now. False when one is already waiting or running (nothing is changed)."""
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT requested_at, started_at, finished_at FROM ops.backup_request WHERE id = 1 FOR UPDATE"
        )
        raw = await cur.fetchone()
    if raw is not None and _state(dict(raw), now) != "idle":
        return False
    await conn.execute(
        "UPDATE ops.backup_request SET requested_at = %s, started_at = NULL, finished_at = NULL, ok = NULL "
        "WHERE id = 1",
        (now,),
    )
    return True
