"""The kill switch ("Durdur") and its two-person restart (mock scenarios.ts engageKillSwitch(),
enterprise.ts startKillReset() / confirmKillReset()).

Each function changes trading.risk_state and appends its audit record in one transaction (nested
calls become savepoints). The caller reads the new RiskStatus and publishes SSE after the commit.
Errors are `ApiError`s with the mock's codes and Turkish texts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append
from kaptan.domain.permissions import SAME_PERSON_TEXT
from kaptan.domain.schemas._base import iso_ms

#: Who engages the kill switch automatically (06 §11 R01).
RISK_MONITOR: Final = "system:risk_monitor"
#: After a confirmed restart the drawdown starts just inside the −5 % threshold (enterprise.ts).
RESET_DRAWDOWN_FLOOR: Final = -0.049

NOT_ON: Final = "Sistem çalışıyor; yeniden başlatılacak bir şey yok."
ALREADY_ON: Final = "Zaten durduruldu."
ALREADY_STARTED: Final = "Yeniden başlatma zaten başlatıldı; Risk Sorumlusu’nun onayını bekliyor."
NOT_STARTED: Final = "Önce Yönetici yeniden başlatmayı başlatmalı (1/2)."

LOCK_SQL: Final = "SELECT kill_switch, reset_started FROM trading.risk_state WHERE id = 1 FOR UPDATE"

CANCEL_OPEN_SQL: Final = """
UPDATE trading.orders SET status = 'canceled', cancel_reason = 'kill_switch', updated_at = now()
WHERE broker = 'simbist' AND status IN ('pending_open', 'accepted')
RETURNING id
"""

ENGAGE_SQL: Final = """
UPDATE trading.risk_state SET kill_switch = 'on', kill_reason = %s, kill_at = %s, kill_by = %s,
  reset_started = NULL, positions_managed_by_exit = true, updated_at = now()
WHERE id = 1
"""

KILL_ENTITY: Final = ("system_flag", "kill_switch")


async def _lock(conn: AsyncConnection[Any]) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(LOCK_SQL)
        row = await cur.fetchone()
    if row is None:
        raise ApiError(500, "no_risk_state", "Risk durumu bulunamadı.")
    return dict(row)


async def engage(
    conn: AsyncConnection[Any], *, by: str, reason: str, role: str | None, now: datetime, check_off: bool = True
) -> int:
    """Turn the kill switch on: cancel open SimBIST orders, hand positions to the exit rules,
    audit `kill_switch.on` {reason, role, canceled_orders}. Returns the number of canceled orders.
    409 `already_on` when it is on already (unless `check_off=False`)."""
    async with conn.transaction():
        state = await _lock(conn)
        if check_off and state["kill_switch"] == "on":
            raise ApiError(409, "already_on", ALREADY_ON)
        async with conn.cursor() as cur:
            await cur.execute(CANCEL_OPEN_SQL)
            canceled = len(await cur.fetchall())
            await cur.execute(ENGAGE_SQL, (reason, now, by))
        await append(
            conn,
            [
                AuditDraft(
                    actor=by,
                    action="kill_switch.on",
                    entity_type=KILL_ENTITY[0],
                    entity_id=KILL_ENTITY[1],
                    payload={"reason": reason, "role": role, "canceled_orders": canceled},
                    occurred_at=now,
                )
            ],
        )
    return canceled


def signature(uid: str, name: str, role: str, at: datetime, reason: str | None) -> dict[str, Any]:
    """A Signature document as stored in JSONB (ISO-ms time, like the mock's signatureOf())."""
    return {"uid": uid, "name": name, "role": role, "at": iso_ms(at), "reason": reason}


async def start_reset(
    conn: AsyncConnection[Any], *, uid: str, name: str, role: str, reason: str, now: datetime
) -> None:
    """Yönetici starts the restart (1/2): audit `kill_switch.reset_started` {step: 1, role, reason}."""
    async with conn.transaction():
        state = await _lock(conn)
        if state["kill_switch"] != "on":
            raise ApiError(409, "not_on", NOT_ON)
        if state["reset_started"] is not None:
            raise ApiError(409, "already_started", ALREADY_STARTED)
        sig = signature(uid, name, role, now, reason)
        await conn.execute(
            "UPDATE trading.risk_state SET reset_started = %s, updated_at = now() WHERE id = 1", (Jsonb(sig),)
        )
        await append(
            conn,
            [
                AuditDraft(
                    actor=f"user:{uid}",
                    action="kill_switch.reset_started",
                    entity_type=KILL_ENTITY[0],
                    entity_id=KILL_ENTITY[1],
                    payload={"step": 1, "role": role, "reason": reason},
                    occurred_at=now,
                )
            ],
        )


async def confirm_reset(conn: AsyncConnection[Any], *, uid: str, role: str, reason: str, now: datetime) -> None:
    """Risk Sorumlusu confirms (2/2), never the person who started it (403 `same_person`):
    kill switch off, drawdown floored at −4.9 %, audit `kill_switch.reset` {step: 2, role, reason, started_by}."""
    async with conn.transaction():
        state = await _lock(conn)
        if state["kill_switch"] != "on":
            raise ApiError(409, "not_on", NOT_ON)
        started = state["reset_started"]
        if started is None:
            raise ApiError(409, "not_started", NOT_STARTED)
        if started["uid"] == uid:
            raise ApiError(403, "same_person", SAME_PERSON_TEXT["kill_reset"])
        await conn.execute(
            """
            UPDATE trading.risk_state SET kill_switch = 'off', kill_reason = NULL, kill_at = NULL, kill_by = NULL,
              reset_started = NULL, drawdown_pct = GREATEST(drawdown_pct, %s), updated_at = now()
            WHERE id = 1""",
            (RESET_DRAWDOWN_FLOOR,),
        )
        await append(
            conn,
            [
                AuditDraft(
                    actor=f"user:{uid}",
                    action="kill_switch.reset",
                    entity_type=KILL_ENTITY[0],
                    entity_id=KILL_ENTITY[1],
                    payload={"step": 2, "role": role, "reason": reason, "started_by": started["uid"]},
                    occurred_at=now,
                )
            ],
        )
