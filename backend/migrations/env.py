"""Alembic environment: SQL-first migrations run as the owner role (DATABASE_OWNER_URL).

`-x db=test` targets TEST_DATABASE_OWNER_URL; `-x url=postgresql://...` overrides both.
No SQLAlchemy models: every revision is plain SQL via `op.execute()`.
"""

from __future__ import annotations

from alembic import context
from sqlalchemy import create_engine, pool

from kaptan.settings import get_settings


def _url() -> str:
    args = context.get_x_argument(as_dictionary=True)
    settings = get_settings()
    url = args.get("url")
    if not url:
        owner = settings.test_database_owner_url if args.get("db") == "test" else settings.database_owner_url
        if owner is None:
            raise RuntimeError("DATABASE_OWNER_URL / TEST_DATABASE_OWNER_URL is not set (backend/.env)")
        url = owner.get_secret_value()
    return url.replace("postgresql://", "postgresql+psycopg://", 1)


def run_migrations_offline() -> None:
    context.configure(url=_url(), literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, transaction_per_migration=True)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
