"""Where the login password lives, and how the person changes it in the app.

Two places, one rule: `auth.credentials.passphrase_hash` (set in the app) wins when it is there, otherwise
`PASSPHRASE_HASH` from the environment (the installer) is the password. The installer clears the database one when
it sets a new password (kur.ps1), so whichever was changed last is the one that works.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Final

from psycopg import AsyncConnection
from pwdlib.exceptions import UnknownHashError

from kaptan.auth.passphrase import MAX_PASSPHRASE_LEN, _hasher, hash_passphrase
from kaptan.settings import Settings

MIN_LEN: Final = 6
KNOWN_PUBLIC: Final = "kaptan2026"

TOO_SHORT: Final = f"Yeni parola en az {MIN_LEN} karakter olmalı."
TOO_LONG: Final = f"Yeni parola en fazla {MAX_PASSPHRASE_LEN} karakter olabilir."
PUBLIC: Final = "Bu parola herkesçe biliniyor. Başka bir parola seç."
SAME: Final = "Yeni parola şimdikiyle aynı. Başka bir parola seç."


def new_password_problem(current: str, new: str) -> str | None:
    """The Turkish reason a new password is refused, or None."""
    if len(new) < MIN_LEN:
        return TOO_SHORT
    if len(new) > MAX_PASSPHRASE_LEN:
        return TOO_LONG
    if new == KNOWN_PUBLIC:
        return PUBLIC
    if new == current:
        return SAME
    return None


async def stored_hash(conn: AsyncConnection[Any]) -> str | None:
    async with conn.cursor() as cur:
        await cur.execute("SELECT passphrase_hash FROM auth.credentials WHERE id = 1")
        row = await cur.fetchone()
    if row is None:
        return None
    value = row["passphrase_hash"] if isinstance(row, dict) else row[0]
    return str(value) if value else None


async def effective_hash(conn: AsyncConnection[Any], settings: Settings) -> str | None:
    """The hash a login is checked against: the app's own when set, else the environment's."""
    own = await stored_hash(conn)
    if own is not None:
        return own
    return settings.passphrase_hash.get_secret_value() if settings.passphrase_hash is not None else None


def _verify(password: str, hashed: str) -> bool:
    if len(password) > MAX_PASSPHRASE_LEN:
        return False
    try:
        return bool(_hasher().verify(password, hashed))
    except UnknownHashError:
        return False


async def verify_login(conn: AsyncConnection[Any], settings: Settings, password: str) -> bool:
    hashed = await effective_hash(conn, settings)
    await conn.commit()  # end the read: what the caller writes next (an audit record) must not ride on it
    if hashed is None:
        return False
    return await asyncio.to_thread(_verify, password, hashed)


async def hash_in_thread(password: str) -> str:
    return await asyncio.to_thread(hash_passphrase, password)


async def store_hash(conn: AsyncConnection[Any], hashed: str, now: datetime) -> None:
    await conn.execute("UPDATE auth.credentials SET passphrase_hash = %s, changed_at = %s WHERE id = 1", (hashed, now))
