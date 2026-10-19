"""The migrate job: `python -m kaptan.ops.migrate` = `alembic upgrade head` as the owner role, then a check.

Needs DATABASE_OWNER_URL (the only process that does). Prints the revision before and after; exit 0 when
the database is at this code's head, 1 when it is not afterwards, 2 on a configuration error.
"""

from __future__ import annotations

import logging
import sys

from kaptan.ops.health import ALEMBIC_INI, code_heads
from kaptan.ops.logs import setup_logging
from kaptan.settings import ConfigError, Settings, ensure_production_ready, get_settings

log = logging.getLogger("kaptan.ops.migrate")


def db_heads(settings: Settings) -> frozenset[str]:
    import psycopg

    assert settings.database_owner_url is not None
    with psycopg.connect(settings.database_owner_url.get_secret_value(), connect_timeout=10) as conn:
        exists = conn.execute("SELECT to_regclass('public.alembic_version') IS NOT NULL").fetchone()
        if not exists or not exists[0]:
            return frozenset()
        return frozenset(str(r[0]) for r in conn.execute("SELECT version_num FROM public.alembic_version"))


def upgrade(settings: Settings) -> frozenset[str]:
    from alembic import command
    from alembic.config import Config

    before = db_heads(settings)
    head = ",".join(sorted(code_heads()))
    log.info("migrate: database at %s, code head %s", ",".join(sorted(before)) or "<empty>", head)
    command.upgrade(Config(str(ALEMBIC_INI)), "head")
    after = db_heads(settings)
    log.info("migrate: database now at %s", ",".join(sorted(after)))
    return after


def main() -> int:
    try:
        settings = get_settings()
        setup_logging(settings, "migrate")
        ensure_production_ready(settings, "migrate")
    except ConfigError as exc:
        logging.getLogger("kaptan.ops.migrate").error("%s", exc)
        return 2
    after = upgrade(settings)
    if after != code_heads():
        log.error("migrate: database is not at head after the upgrade (%s)", ",".join(sorted(after)))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
