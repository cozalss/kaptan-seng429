"""Throwaway databases next to the test database (bootstrap and backup tests)."""

from __future__ import annotations

import argparse

import psycopg
from psycopg import sql

from tests.conftest import BACKEND


def sibling_url(url: str, dbname: str) -> str:
    """The same server and credentials, another database."""
    head, _, tail = url.rpartition("/")
    query = tail.partition("?")[2]
    return f"{head}/{dbname}" + (f"?{query}" if query else "")


def recreate(owner_url: str, dbname: str) -> str:
    """DROP (force) + CREATE `dbname` on the owner's server; returns its owner URL."""
    admin = sibling_url(owner_url, "postgres")
    with psycopg.connect(admin, autocommit=True) as conn:
        conn.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(dbname)))
        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(dbname)))
    return sibling_url(owner_url, dbname)


def drop(owner_url: str, dbname: str) -> None:
    with psycopg.connect(sibling_url(owner_url, "postgres"), autocommit=True) as conn:
        conn.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(dbname)))


def migrate(url: str) -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.cmd_opts = argparse.Namespace(x=[f"url={url}"])
    command.upgrade(cfg, "head")
