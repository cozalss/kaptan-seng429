"""The kill switch ("Durdur") and its restart (mock scenarios.ts engageKillSwitch(), enterprise.ts startKillReset() /
confirmKillReset()).

Each function changes trading.risk_state and appends its audit record in one transaction (nested
calls become savepoints). The caller reads the new RiskStatus and publishes SSE after the commit.
Errors are `ApiError`s with the mock's codes and plain Turkish texts.

The restart rule (06 §11, FR-20 Rev 2): the one person holds both keys, so the confirm always waits ≥ 24 h after the
request and ≥ 5 BIST sessions after the stop. Old ledgers may hold `kill_switch.wait_waived` rows from when the wait
could be skipped; they stay readable (kaptan.audit.search) and nothing writes that action any more.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append
from kaptan.auth.four_eyes import second_signature
from kaptan.domain.schemas._base import iso_ms
from kaptan.prices.calendar import IST, SESSION_OPEN, add_sessions, istanbul_date

#: Who engages the kill switch automatically (06 §11 R01).
RISK_MONITOR: Final = "system:risk_monitor"
#: After a confirmed restart the drawdown starts just inside the −5 % threshold (enterprise.ts).
RESET_DRAWDOWN_FLOOR: Final = -0.049

NOT_ON: Final = "Sistem çalışıyor; yeniden başlatılacak bir şey yok."
ALREADY_ON: Final = "Zaten durduruldu."
ALREADY_STARTED: Final = "Yeniden başlatma isteğin zaten alındı."
NOT_STARTED: Final = "Önce yeniden başlatma isteği göndermelisin."

LOCK_SQL: Final = "SELECT kill_switch, kill_at, reset_started FROM trading.risk_state WHERE id = 1 FOR UPDATE"

RESTART_CONFIRM_GAP: Final = timedelta(hours=24)
RESTART_COOLDOWN_SESSIONS: Final = 5

CANCEL_OPEN_SQL: Final = """
UPDATE trading.orders SET status = 'canceled', cancel_reason = 'kill_switch', updated_at = now()
WHERE broker = 'simbist' AND status IN ('pending_open', 'accepted')
RETURNING id
"""

ENGAGE_SQL: Final = """
UPDATE trading.risk_state SET kill_switch = 'on', kill_reason = %s, kill_at = %s, kill_by = %s,
  reset_started = NULL, positions_managed_by_exit = true, reset_at = NULL, reset_equity = NULL, updated_at = now()
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
    conn: AsyncConnection[Any],
    *,
    by: str,
    reason: str,
    role: str | None,
    now: datetime,
    check_off: bool = True,
    extra: dict[str, Any] | None = None,
) -> int:
    """Turn the kill switch on: cancel open SimBIST orders, hand positions to the exit rules,
    audit `kill_switch.on` {reason, role, canceled_orders, **extra}. Returns the number of canceled orders.
    409 `already_on` when it is on already (unless `check_off=False`). `extra` (the risk monitor's
    equity/peak snapshot, 06 §11) is appended to the payload."""
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
                    payload={"reason": reason, "role": role, "canceled_orders": canceled, **(extra or {})},
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
    """The restart request (1/2): audit `kill_switch.reset_started` {step: 1, role, reason}."""
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


def reset_ready_at(kill_at: datetime | None, started_at: datetime) -> datetime:
    """When the confirm opens: ≥ 24 h after the request and once the 5th BIST session after the stop's day has
    opened (06 §11 step 2–3; the stop's own day never counts)."""
    earliest = started_at + RESTART_CONFIRM_GAP
    if kill_at is None:
        return earliest
    fifth = add_sessions(istanbul_date(kill_at), RESTART_COOLDOWN_SESSIONS)
    return max(earliest, datetime.combine(fifth, SESSION_OPEN, IST))


def reset_view(started: dict[str, Any] | None, kill_at: datetime | None, now: datetime) -> dict[str, Any]:
    """RiskStatus.reset while stopped. `ready_at` is null unless a request waits for its time."""
    if started is None:
        return {"started": started, "ready_at": None}
    ready = reset_ready_at(kill_at, datetime.fromisoformat(started["at"]))
    return {"started": started, "ready_at": ready if now < ready else None}


def too_early_text(ready: datetime) -> str:
    when = ready.astimezone(IST).strftime("%d.%m.%Y %H:%M")
    return (
        "Yeniden başlatmak için biraz beklemen gerekiyor: isteğinden sonra en az 24 saat, "
        f"durdurmadan sonra en az 5 borsa günü geçmeli. Açılış zamanı: {when}."
    )


async def confirm_reset(conn: AsyncConnection[Any], *, uid: str, role: str, reason: str, now: datetime) -> None:
    """The restart confirm (2/2): kill switch off, drawdown floored at −4.9 %, the waived second signature on record,
    audit `kill_switch.reset` {step: 2, role, reason, started_by}. 409 `conflict` until `reset_ready_at()`."""
    async with conn.transaction():
        state = await _lock(conn)
        if state["kill_switch"] != "on":
            raise ApiError(409, "not_on", NOT_ON)
        started = state["reset_started"]
        if started is None:
            raise ApiError(409, "not_started", NOT_STARTED)
        ready = reset_ready_at(state["kill_at"], datetime.fromisoformat(started["at"]))
        if now < ready:
            raise ApiError(409, "conflict", too_early_text(ready))
        await second_signature(
            conn,
            first_uid=str(started["uid"]),
            uid=uid,
            flow="kill_reset",
            entity_type=KILL_ENTITY[0],
            entity_id=KILL_ENTITY[1],
            now=now,
        )
        await conn.execute(
            """
            UPDATE trading.risk_state SET kill_switch = 'off', kill_reason = NULL, kill_at = NULL, kill_by = NULL,
              reset_started = NULL, drawdown_pct = GREATEST(drawdown_pct, %s), reset_at = %s, reset_equity = NULL,
              updated_at = now()
            WHERE id = 1""",
            (RESET_DRAWDOWN_FLOOR, now),
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
