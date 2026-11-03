"""Refresh-token families (auth.refresh_tokens): rotate on every use, detect reuse.

A family starts at login and lives at most REFRESH_TOKEN_TTL_S (8 h, absolute). Each /auth/refresh
marks the presented token used and issues a successor in the same family. Presenting a used or
revoked token again revokes the whole family (stolen-token detection, 09 §6).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from psycopg import AsyncConnection

from kaptan.auth.tokens import new_family_id, new_refresh_token, refresh_token_hash
from kaptan.domain.roles import OWNER


@dataclass(frozen=True, slots=True)
class RefreshSession:
    token: str  # the new opaque token for the cookie
    family: str
    expires_at: datetime


class RefreshRejectedError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


_INSERT = """
INSERT INTO auth.refresh_tokens (token_hash, family_id, uid, role, issued_at, expires_at)
VALUES (%s, %s, %s, %s, %s, %s)
"""


async def start_family(conn: AsyncConnection[Any], *, now: datetime, ttl_s: int) -> RefreshSession:
    token = new_refresh_token()
    family = new_family_id()
    expires = now + timedelta(seconds=ttl_s)
    await conn.execute(_INSERT, (refresh_token_hash(token), family, OWNER.uid, OWNER.role, now, expires))
    return RefreshSession(token=token, family=family, expires_at=expires)


async def revoke_family(conn: AsyncConnection[Any], family: str, now: datetime) -> None:
    await conn.execute(
        "UPDATE auth.refresh_tokens SET revoked_at = %s WHERE family_id = %s AND revoked_at IS NULL",
        (now, family),
    )


async def rotate(conn: AsyncConnection[Any], token: str, now: datetime, *, grace_s: int = 0) -> RefreshSession:
    """Swap a refresh token for its successor. Must run in a transaction (row lock).

    `grace_s` (REFRESH_GRACE_S): a token rotated at most that many seconds ago, in a family that is still
    live, gets one more successor instead of revoking the family, so two tabs refreshing at the same
    moment both stay signed in. Outside the window a reuse is still treated as theft."""
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT family_id, expires_at, used_at, revoked_at FROM auth.refresh_tokens "
            "WHERE token_hash = %s FOR UPDATE",
            (refresh_token_hash(token),),
        )
        row = await cur.fetchone()
    if row is None:
        raise RefreshRejectedError("unknown")
    family = str(_col(row, 0, "family_id"))
    used_at: datetime | None = _col(row, 2, "used_at")
    expires_at: datetime = _col(row, 1, "expires_at")
    in_grace = (
        used_at is not None
        and _col(row, 3, "revoked_at") is None
        and grace_s > 0
        and now - used_at <= timedelta(seconds=grace_s)
        and expires_at > now
    )
    if not in_grace and (used_at is not None or _col(row, 3, "revoked_at") is not None):
        await revoke_family(conn, family, now)
        raise RefreshRejectedError("reused")
    if expires_at <= now:
        raise RefreshRejectedError("expired")
    if not in_grace:
        await conn.execute(
            "UPDATE auth.refresh_tokens SET used_at = %s WHERE token_hash = %s", (now, refresh_token_hash(token))
        )
    successor = new_refresh_token()
    await conn.execute(_INSERT, (refresh_token_hash(successor), family, OWNER.uid, OWNER.role, now, expires_at))
    return RefreshSession(token=successor, family=family, expires_at=expires_at)


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
