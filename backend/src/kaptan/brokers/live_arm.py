"""The three live keys (09 §8) and the UI key's two signatures.

K1 config (`config/trading.yaml` mode: live, or KAPTAN_MODE=live) · K2 env (KAPTAN_LIVE_ENABLED=true)
· K3 UI: the Yönetici starts the arm (1/2), the Risk Sorumlusu confirms it (2/2, someone else); it
drops by itself at 18:30 Istanbul and cannot be set while the kill switch is on.

Arming only records the keys. There is no real broker for BIST, so `missing_keys()` always lists
`real_broker` and the order path stays on SimBIST (paper), auditing the fallback.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from typing import Any, Final, Literal

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb

from kaptan.api.errors import ApiError
from kaptan.audit.writer import AuditDraft, append
from kaptan.brokers.config import ExecConfig
from kaptan.domain.schemas._base import iso_ms
from kaptan.prices.calendar import IST

#: Live adapters for BIST (04 §8.2): none. Algolab closed on 31.12.2025, Matriks DEK is future work.
REAL_BROKERS: Final[tuple[str, ...]] = ()
ARM_UNTIL: Final = time(18, 30)
ENTITY: Final = ("system_flag", "live_arm")
SAME_PERSON: Final = "Başlatan kişi onaylayamaz; ikinci imza başka birinden gelir."

STATE_SQL: Final = """
SELECT config_live, env_enabled, ui_key, armed, expires_at, arm_started, armed_by, updated_at
FROM trading.live_arm WHERE id = 1
"""
KILL_SQL: Final = "SELECT kill_switch FROM trading.risk_state WHERE id = 1"
ArmAction = Literal["start", "confirm", "disarm"]


@dataclass(frozen=True, slots=True)
class LiveState:
    config_live: bool
    env_enabled: bool
    ui_key: bool
    armed: bool
    expires_at: datetime | None
    started: dict[str, Any] | None
    armed_by: dict[str, Any] | None

    def ui_armed(self, now: datetime) -> bool:
        return self.ui_key and self.expires_at is not None and now < self.expires_at


async def read_state(conn: AsyncConnection[Any], *, lock: bool = False) -> LiveState:
    async with conn.cursor() as cur:
        await cur.execute(STATE_SQL + (" FOR UPDATE" if lock else ""))
        row = await cur.fetchone()
    if row is None:
        return LiveState(False, False, False, False, None, None, None)
    return LiveState(
        config_live=bool(row["config_live"]),
        env_enabled=bool(row["env_enabled"]),
        ui_key=bool(row["ui_key"]),
        armed=bool(row["armed"]),
        expires_at=row["expires_at"],
        started=row["arm_started"],
        armed_by=row["armed_by"],
    )


async def kill_on(conn: AsyncConnection[Any]) -> bool:
    async with conn.cursor() as cur:
        await cur.execute(KILL_SQL)
        row = await cur.fetchone()
    return row is not None and row["kill_switch"] == "on"


def missing_keys(cfg: ExecConfig, state: LiveState, now: datetime, *, kill: bool) -> list[str]:
    """Why a live send is not allowed (empty = allowed). Order: config, env, ui_armed, kill_switch_off, real_broker."""
    checks = (
        ("config", cfg.trading.mode == "live" or cfg.mode_live),
        ("env", cfg.live_env_enabled),
        ("ui_armed", state.ui_armed(now)),
        ("kill_switch_off", not kill),
        ("real_broker", bool(REAL_BROKERS)),
    )
    return [name for name, ok in checks if not ok]


def arm_expiry(now: datetime) -> datetime:
    """18:30 Istanbul of today: the UI key drops at the end of the day (09 §8)."""
    local = now.astimezone(IST)
    return datetime.combine(local.date(), ARM_UNTIL, tzinfo=IST)


def view(cfg: ExecConfig, state: LiveState, now: datetime, *, kill: bool) -> dict[str, Any]:
    """GET /admin/live: LiveArmState + the pending signature + what still blocks a live send."""
    missing = missing_keys(cfg, state, now, kill=kill)
    return {
        "config_live": cfg.trading.mode == "live" or cfg.mode_live,
        "env_enabled": cfg.live_env_enabled,
        "ui_key": state.ui_armed(now),
        "armed": not missing,
        "expires_at": iso_ms(state.expires_at) if state.ui_armed(now) and state.expires_at else None,
        "started": _sig_out(state.started) if not state.ui_armed(now) else None,
        "armed_by": _sig_out(state.armed_by) if state.ui_armed(now) else None,
        "missing": missing,
        "real_broker": bool(REAL_BROKERS),
        "effective_mode": "live" if not missing else "paper",
    }


def _sig_out(sig: dict[str, Any] | None) -> dict[str, Any] | None:
    return None if sig is None else dict(sig)


UPDATE_SQL: Final = """
UPDATE trading.live_arm SET config_live = %s, env_enabled = %s, ui_key = %s, armed = %s, expires_at = %s,
  arm_started = %s, armed_by = %s, updated_at = %s WHERE id = 1
"""


async def _write(
    conn: AsyncConnection[Any],
    cfg: ExecConfig,
    *,
    ui: bool,
    expires: datetime | None,
    started: dict[str, Any] | None,
    armed_by: dict[str, Any] | None,
    now: datetime,
) -> None:
    config = cfg.trading.mode == "live" or cfg.mode_live
    armed = ui and config and cfg.live_env_enabled
    await conn.execute(
        "INSERT INTO trading.live_arm (id) VALUES (1) ON CONFLICT (id) DO NOTHING",
    )
    await conn.execute(
        UPDATE_SQL,
        (
            config,
            cfg.live_env_enabled,
            ui,
            armed,
            expires,
            None if started is None else Jsonb(started),
            None if armed_by is None else Jsonb(armed_by),
            now,
        ),
    )


def _signature(uid: str, name: str, role: str, at: datetime, reason: str) -> dict[str, Any]:
    return {"uid": uid, "name": name, "role": role, "at": iso_ms(at), "reason": reason}


async def change(
    conn: AsyncConnection[Any],
    cfg: ExecConfig,
    action: ArmAction,
    *,
    uid: str,
    name: str,
    role: str,
    reason: str,
    now: datetime,
) -> None:
    """start (admin, 1/2) · confirm (risk officer, 2/2, another person) · disarm (either). One transaction + audit."""
    async with conn.transaction():
        state = await read_state(conn, lock=True)
        kill = await kill_on(conn)
        sig = _signature(uid, name, role, now, reason)
        payload: dict[str, Any]
        if action == "disarm":
            await _write(conn, cfg, ui=False, expires=None, started=None, armed_by=None, now=now)
            audit_action, payload = "live.disarmed", {"role": role}
        elif kill:
            raise ApiError(409, "kill_switch", "Her şey durduruldu: canlı mod silahlandırılamaz.")
        elif action == "start":
            if state.ui_armed(now):
                raise ApiError(409, "already_on", "Canlı anahtar bugün zaten açık.")
            if now >= arm_expiry(now):
                raise ApiError(409, "conflict", "Gün sonu geçti (18:30): yarın yeniden başlatın.")
            await _write(conn, cfg, ui=False, expires=None, started=sig, armed_by=None, now=now)
            audit_action, payload = "live.arm_started", {"role": role}
        else:
            if state.started is None:
                raise ApiError(409, "not_started", "Önce Yönetici silahlandırmayı başlatmalı (1/2).")
            if state.started.get("uid") == uid:
                raise ApiError(403, "same_person", SAME_PERSON)
            if now >= arm_expiry(now):
                raise ApiError(409, "conflict", "Gün sonu geçti (18:30): yarın yeniden başlatın.")
            expires = arm_expiry(now)
            await _write(conn, cfg, ui=True, expires=expires, started=None, armed_by=sig, now=now)
            missing = missing_keys(cfg, LiveState(False, False, True, False, expires, None, sig), now, kill=False)
            audit_action, payload = "live.armed", {"role": role, "missing": missing}
        draft = AuditDraft(
            actor=f"user:{uid}",
            action=audit_action,
            entity_type=ENTITY[0],
            entity_id=ENTITY[1],
            payload=payload,
            occurred_at=now,
        )
        await append(conn, [draft], now=now)
