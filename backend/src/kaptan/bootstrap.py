"""Bootstrap of an empty database (FR-33). Idempotent: running it twice changes nothing.

    # 1) managed Postgres only (docker's db/init/00_roles.sh does this locally): roles + extensions
    BOOTSTRAP_ADMIN_URL=postgresql://admin:...@host/kaptan KAPTAN_APP_PASSWORD=... \\
      uv run python -m kaptan.bootstrap roles
    # 2) uv run alembic upgrade head                       (the migrate job, owner role)
    # 3) reference rows
    uv run python -m kaptan.bootstrap [--dry-run]

`data` (the default) creates what an empty, migrated database needs before the API can run, and only what is
missing:
- limit version 1 (`rules-v1.0`, the canonical values `LIMITS_V1`, 06 §9), active;
- the single `trading.risk_state` row (kill switch off);
- `trading.quota_usage` rows (0 used, limit = today's LLM_CAP_* settings);
- the `trading.live_arm` row with every key off;
- one `system.bootstrap` audit record listing what was created (none when nothing was).
The one account (`sahip`) is not here: migration 0022 creates it, and it signs in with PASSPHRASE_HASH.

`roles` connects with BOOTSTRAP_ADMIN_URL (default DATABASE_OWNER_URL) and runs the SQL of
db/init/00_roles.sh for a managed Postgres: the `kaptan_app` login role (KAPTAN_APP_PASSWORD), optionally
`kaptan_owner` (KAPTAN_OWNER_PASSWORD), CONNECT/CREATE grants and the vector / pg_trgm extensions.
Exit codes: 0 done, 2 configuration error.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Final

from psycopg import AsyncConnection, sql
from psycopg.types.json import Jsonb

from kaptan.api.loop import run
from kaptan.audit.writer import AuditDraft, append
from kaptan.db import connect
from kaptan.domain.roles import OWNER
from kaptan.domain.schemas._base import iso_ms
from kaptan.domain.schemas.governance import LIMITS_V1
from kaptan.llm.usage import QUOTA_ROWS
from kaptan.settings import ConfigError, Settings, ensure_production_ready, get_settings

log = logging.getLogger("kaptan.bootstrap")

APP_ROLE: Final = "kaptan_app"
OWNER_ROLE: Final = "kaptan_owner"
RULES_VERSION: Final = "rules-v1.0"
LIMITS_REASON: Final = f"Kurulum: kanonik başlangıç limitleri ({RULES_VERSION})."
MIN_PASSWORD_LEN: Final = 12
SETUP_UID: Final = "kurulum"
SETUP_NAME: Final = "Kurulum"
EXTENSIONS: Final = ("vector", "pg_trgm")


@dataclass
class BootstrapReport:
    created: list[str] = field(default_factory=list)
    updated: list[str] = field(default_factory=list)
    kept: list[str] = field(default_factory=list)


async def _one(conn: AsyncConnection[Any], query: str, params: Any = None) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(query, params)
        row = await cur.fetchone()
    return None if row is None else dict(row)


def _signature(uid: str, name: str, at: datetime, reason: str) -> dict[str, Any]:
    return {"uid": uid, "name": name, "role": OWNER.role, "at": iso_ms(at), "reason": reason}


async def _limits(conn: AsyncConnection[Any], now: datetime, rep: BootstrapReport) -> None:
    if await _one(conn, "SELECT 1 FROM trading.limit_versions LIMIT 1") is not None:
        rep.kept.append("limits")
        return
    # Nobody chose these values: the setup proposes them (the two-person CHECK of the table stays satisfied).
    proposed = _signature(SETUP_UID, SETUP_NAME, now, "Kurulum: kanonik başlangıç limitleri.")
    decided = _signature(OWNER.uid, OWNER.name, now, "Kurulum: kanonik değerlerle aynı.")
    await conn.execute(
        "INSERT INTO trading.limit_versions (version, status, reason, created_at, effective_from, proposed_by, "
        "decided_by) VALUES (1, 'active', %s, %s, %s, %s, %s)",
        (LIMITS_REASON, now, now, Jsonb(proposed), Jsonb(decided)),
    )
    async with conn.cursor() as cur:
        await cur.executemany(
            "INSERT INTO trading.limits (version, key, value, ord) VALUES (1, %s, %s, %s)",
            [(key, float(value), i) for i, (key, value) in enumerate(LIMITS_V1)],
        )
    rep.created.append("limits:v1")


def quota_caps(settings: Settings) -> dict[str, int]:
    return {
        "gemini": settings.llm_cap_gemini_rpd,
        "groq": settings.llm_cap_groq_rpd,
        "prompt_guard": settings.llm_cap_guard_rpd,
        "deepseek": settings.llm_cap_deepseek_rpd,
    }


async def _singletons(conn: AsyncConnection[Any], settings: Settings, rep: BootstrapReport) -> None:
    cur = await conn.execute("INSERT INTO trading.risk_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING")
    (rep.created if cur.rowcount else rep.kept).append("risk_state")
    cur = await conn.execute(
        "INSERT INTO trading.live_arm (id, config_live, env_enabled, ui_key, armed, expires_at) "
        "VALUES (1, false, false, false, false, NULL) ON CONFLICT (id) DO NOTHING"
    )
    (rep.created if cur.rowcount else rep.kept).append("live_arm")
    for provider, cap in quota_caps(settings).items():
        label, order = QUOTA_ROWS[provider]
        if cap <= 0:
            continue
        cur = await conn.execute(
            "INSERT INTO trading.quota_usage (provider, ord, used, per_injection, limit_n) VALUES (%s, %s, 0, 0, %s) "
            "ON CONFLICT (provider) DO NOTHING",
            (label, order, cap),
        )
        (rep.created if cur.rowcount else rep.kept).append(f"quota:{provider}")


async def bootstrap_data(
    conn: AsyncConnection[Any],
    settings: Settings,
    *,
    now: datetime | None = None,
    dry_run: bool = False,
) -> BootstrapReport:
    """Create what is missing, in one transaction (rolled back with `dry_run`)."""
    now = now or datetime.now(UTC)
    rep = BootstrapReport()
    tx = conn.transaction(force_rollback=dry_run)
    async with tx:
        await _limits(conn, now, rep)
        await _singletons(conn, settings, rep)
        if rep.created or rep.updated:
            draft = AuditDraft(
                actor="system:bootstrap",
                action="system.bootstrap",
                entity_type="system",
                entity_id="bootstrap",
                payload={"created": rep.created, "updated": rep.updated, "rules_version": RULES_VERSION},
                occurred_at=now,
            )
            await append(conn, [draft], now=now)
    return rep


# ── roles (managed Postgres) ─────────────────────────────────────────────────


async def _ensure_role(conn: AsyncConnection[Any], role: str, password: str, *, rotate: bool) -> str:
    exists = await _one(conn, "SELECT 1 FROM pg_roles WHERE rolname = %s", (role,))
    if exists is None:
        await conn.execute(
            sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}").format(sql.Identifier(role), sql.Literal(password))
        )
        return "created"
    if rotate:
        await conn.execute(
            sql.SQL("ALTER ROLE {} WITH LOGIN PASSWORD {}").format(sql.Identifier(role), sql.Literal(password))
        )
        return "rotated"
    return "kept"


async def bootstrap_roles(
    conn: AsyncConnection[Any], environ: dict[str, str], *, rotate: bool = False
) -> dict[str, str]:
    """kaptan_app (and kaptan_owner when KAPTAN_OWNER_PASSWORD is set), grants, extensions. Autocommit conn."""
    app_pw = environ.get("KAPTAN_APP_PASSWORD")
    if not app_pw or len(app_pw) < MIN_PASSWORD_LEN:
        raise ConfigError(f"KAPTAN_APP_PASSWORD must be set (at least {MIN_PASSWORD_LEN} characters)")
    db_row = await _one(conn, "SELECT current_database() AS db")
    assert db_row is not None
    db = sql.Identifier(str(db_row["db"]))
    done = {APP_ROLE: await _ensure_role(conn, APP_ROLE, app_pw, rotate=rotate)}
    owner_pw = environ.get("KAPTAN_OWNER_PASSWORD")
    if owner_pw:
        done[OWNER_ROLE] = await _ensure_role(conn, OWNER_ROLE, owner_pw, rotate=rotate)
        await conn.execute(
            sql.SQL("GRANT CONNECT, CREATE, TEMPORARY ON DATABASE {} TO {}").format(db, sql.Identifier(OWNER_ROLE))
        )
    await conn.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(db, sql.Identifier(APP_ROLE)))
    for ext in EXTENSIONS:
        await conn.execute(sql.SQL("CREATE EXTENSION IF NOT EXISTS {}").format(sql.Identifier(ext)))
        done[f"extension:{ext}"] = "ok"
    return done


# ── CLI ───────────────────────────────────────────────────────────────────────


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m kaptan.bootstrap", description=__doc__.split("\n")[0])
    parser.add_argument("cmd", nargs="?", choices=("data", "roles"), default="data")
    parser.add_argument("--dry-run", action="store_true", help="data: show what would be created, change nothing")
    parser.add_argument("--rotate", action="store_true", help="roles: set the passwords of existing roles again")
    return parser.parse_args(argv)


async def _main(settings: Settings, args: argparse.Namespace) -> int:
    environ = dict(os.environ)
    if args.cmd == "roles":
        admin = environ.get("BOOTSTRAP_ADMIN_URL") or (
            settings.database_owner_url.get_secret_value() if settings.database_owner_url else None
        )
        if not admin:
            raise ConfigError("BOOTSTRAP_ADMIN_URL (or DATABASE_OWNER_URL) is not set")
        conn = await connect(admin, autocommit=True)
        try:
            for name, what in (await bootstrap_roles(conn, environ, rotate=args.rotate)).items():
                print(f"{name:24s} {what}")
        finally:
            await conn.close()
        return 0
    url = settings.database_owner_url or settings.database_url
    conn = await connect(url.get_secret_value())
    try:
        rep = await bootstrap_data(conn, settings, dry_run=args.dry_run)
    finally:
        await conn.close()
    prefix = "would create" if args.dry_run else "created"
    print(f"{prefix}: {', '.join(rep.created) or '-'}")
    print(f"updated: {', '.join(rep.updated) or '-'}")
    print(f"already there: {', '.join(rep.kept) or '-'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        settings = get_settings()
        ensure_production_ready(settings, "bootstrap")
        return run(_main(settings, args))
    except ConfigError as exc:
        print(f"bootstrap: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
