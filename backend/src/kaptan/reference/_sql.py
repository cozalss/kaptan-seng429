"""Tiny parametrised-SQL helpers shared by the reference, fundamentals and data-quality jobs."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from psycopg import AsyncConnection
from psycopg.rows import dict_row

Conn = AsyncConnection[Any]
Params = Sequence[Any] | dict[str, Any]


async def fetch_all(conn: Conn, sql: str, params: Params = ()) -> list[dict[str, Any]]:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql, params)
        return await cur.fetchall()


async def fetch_one(conn: Conn, sql: str, params: Params = ()) -> dict[str, Any] | None:
    found = await fetch_all(conn, sql, params)
    return found[0] if found else None


async def execute_many(conn: Conn, sql: str, params: Sequence[Params]) -> int:
    if not params:
        return 0
    async with conn.cursor() as cur:
        await cur.executemany(sql, params)
    return len(params)


async def execute(conn: Conn, sql: str, params: Params = ()) -> int:
    """Run one statement; returns the affected row count."""
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
        return cur.rowcount
