"""Async Postgres access: one psycopg 3 connection pool per process, dict rows, parametrised SQL only.

Usage in a router:

    async def handler(conn: Conn) -> ...:
        async with conn.transaction():          # writes: commit before the response is built
            await conn.execute("UPDATE ... WHERE id = %s", (pid,))
            await audit.append(conn, [AuditDraft(...)])

Windows note: psycopg's async mode cannot run on the ProactorEventLoop (the Windows default);
start uvicorn with `--loop kaptan.api.loop:selector_loop` or `python -m kaptan.api`.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import Depends, Request
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

DictConn = AsyncConnection[dict[str, Any]]


async def _configure(conn: DictConn) -> None:
    # Hashes and the demo clock assume UTC; set it per connection so it never depends on the server.
    await conn.execute("SET TIME ZONE 'UTC'")
    await conn.commit()


def create_pool(conninfo: str, *, min_size: int = 1, max_size: int = 10) -> AsyncConnectionPool[DictConn]:
    """A closed pool; open it with `await pool.open(wait=True)` inside the running loop."""
    return AsyncConnectionPool(
        conninfo,
        min_size=min_size,
        max_size=max_size,
        kwargs={"row_factory": dict_row, "autocommit": False},
        configure=_configure,
        open=False,
        name="kaptan",
    )


async def connect(conninfo: str, *, autocommit: bool = False) -> DictConn:
    """A single connection (scripts, seeder, migrations helpers)."""
    conn = await AsyncConnection.connect(conninfo, row_factory=dict_row, autocommit=autocommit)
    await conn.execute("SET TIME ZONE 'UTC'")
    if not autocommit:
        await conn.commit()
    return conn


async def get_conn(request: Request) -> AsyncIterator[DictConn]:
    """FastAPI dependency: a pooled connection; committed on success, rolled back on error."""
    pool: AsyncConnectionPool[DictConn] = request.app.state.pool
    async with pool.connection() as conn:
        yield conn


Conn = Annotated[DictConn, Depends(get_conn)]
