"""Refresh-token families (auth.refresh_tokens): rotate on every use, detect reuse, remember the role.

A family starts at login and lives at most REFRESH_TOKEN_TTL_S (8 h, absolute). Each /auth/refresh
marks the presented token used and issues a successor in the same family. Presenting a used or
revoked token again revokes the whole family (stolen-token detection, 09 §6). /auth/role changes
the family's role, so a refresh keeps the role you were looking through.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from psycopg import AsyncConnection

from kaptan.auth.tokens import new_family_id, new_refresh_token, refresh_token_hash
from kaptan.domain.roles import Role


@dataclass(frozen=True, slots=True)
class RefreshSession:
    token: str  # the new opaque token for the cookie
    family: str
    uid: str
    role: Role
    expires_at: datetime


class RefreshRejectedError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


_INSERT = """
INSERT INTO auth.refresh_tokens (token_hash, family_id, uid, role, issued_at, expires_at)
VALUES (%s, %s, %s, %s, %s, %s)
"""


async def start_family(
    conn: AsyncConnection[Any], *, uid: str, role: Role, now: datetime, ttl_s: int
) -> RefreshSession:
    token = new_refresh_token()
    family = new_family_id()
    expires = now + timedelta(seconds=ttl_s)
    await conn.execute(_INSERT, (refresh_token_hash(token), family, uid, role, now, expires))
    return RefreshSession(token=token, family=family, uid=uid, role=role, expires_at=expires)


async def revoke_family(conn: AsyncConnection[Any], family: str, now: datetime) -> None:
    await conn.execute(
        "UPDATE auth.refresh_tokens SET revoked_at = %s WHERE family_id = %s AND revoked_at IS NULL",
        (now, family),
    )


async def rotate(conn: AsyncConnection[Any], token: str, now: datetime) -> RefreshSession:
    """Swap a refresh token for its successor. Must run in a transaction (row lock)."""
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT family_id, uid, role, expires_at, used_at, revoked_at FROM auth.refresh_tokens "
            "WHERE token_hash = %s FOR UPDATE",
            (refresh_token_hash(token),),
        )
        row = await cur.fetchone()
    if row is None:
        raise RefreshRejectedError("unknown")
    family = str(_col(row, 0, "family_id"))
    if _col(row, 4, "used_at") is not None or _col(row, 5, "revoked_at") is not None:
        await revoke_family(conn, family, now)
        raise RefreshRejectedError("reused")
    expires_at: datetime = _col(row, 3, "expires_at")
    if expires_at <= now:
        raise RefreshRejectedError("expired")
    await conn.execute(
        "UPDATE auth.refresh_tokens SET used_at = %s WHERE token_hash = %s", (now, refresh_token_hash(token))
    )
    successor = new_refresh_token()
    uid, role = str(_col(row, 1, "uid")), _col(row, 2, "role")
    await conn.execute(_INSERT, (refresh_token_hash(successor), family, uid, role, now, expires_at))
    return RefreshSession(token=successor, family=family, uid=uid, role=role, expires_at=expires_at)


async def set_family_role(conn: AsyncConnection[Any], *, family: str, uid: str, role: Role) -> None:
    """The family's live token now carries the new role (and the role's team member)."""
    await conn.execute(
        "UPDATE auth.refresh_tokens SET role = %s, uid = %s "
        "WHERE family_id = %s AND used_at IS NULL AND revoked_at IS NULL",
        (role, uid, family),
    )


async def revoke_by_token(conn: AsyncConnection[Any], token: str, now: datetime) -> None:
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT family_id FROM auth.refresh_tokens WHERE token_hash = %s", (refresh_token_hash(token),)
        )
        row = await cur.fetchone()
    if row is not None:
        await revoke_family(conn, str(_col(row, 0, "family_id")), now)


def _col(row: Any, index: int, key: str) -> Any:
    return row[key] if isinstance(row, dict) else row[index]
