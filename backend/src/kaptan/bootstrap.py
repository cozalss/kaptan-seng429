"""Production bootstrap without the demo seed (FR-33). Idempotent: running it twice changes nothing.

    # 1) managed Postgres only (docker's db/init/00_roles.sh does this locally): roles + extensions
    BOOTSTRAP_ADMIN_URL=postgresql://admin:...@host/kaptan KAPTAN_APP_PASSWORD=... \\
      uv run python -m kaptan.bootstrap roles
    # 2) uv run alembic upgrade head                       (the migrate job, owner role)
    # 3) reference rows
    uv run python -m kaptan.bootstrap [--users config/team.yaml] [--dry-run]

`data` (the default) creates what an empty, migrated database needs before the API can run outside
DEMO_MODE, and only what is missing:
- `auth.users`: the team (`domain/roles.TEAM`; a users file may rename people and give each a password
  through `password_env`, the name of an environment variable; the password is hashed with argon2id
  and neither the password nor the hash is ever printed or logged);
- limit version 1 (`rules-v1.0`, the canonical values `LIMITS_V1`, 06 §9), active;
- the single `trading.risk_state` row (kill switch off);
- `trading.quota_usage` rows (0 used, limit = today's LLM_CAP_* settings);
- the `trading.live_arm` row with every key off;
- one `system.bootstrap` audit record listing what was created (none when nothing was).

`roles` connects with BOOTSTRAP_ADMIN_URL (default DATABASE_OWNER_URL) and runs the SQL of
db/init/00_roles.sh for a managed Postgres: the `kaptan_app` login role (KAPTAN_APP_PASSWORD), optionally
`kaptan_owner` (KAPTAN_OWNER_PASSWORD), CONNECT/CREATE grants and the vector / pg_trgm extensions.
Exit codes: 0 done, 2 configuration error.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final

import yaml
from psycopg import AsyncConnection, sql
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from kaptan.api.loop import run
from kaptan.audit.writer import AuditDraft, append
from kaptan.auth.passphrase import hash_passphrase, verify_hash
from kaptan.db import connect
from kaptan.domain.roles import ROLES, TEAM, Role, member_for_role
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
EXTENSIONS: Final = ("vector", "pg_trgm")


class UserSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    uid: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{1,39}$")
    display_name: str = Field(min_length=1, max_length=80)
    role: Role
    duty_tr: str = Field(default="", max_length=120)
    password_env: str | None = Field(default=None, pattern=r"^[A-Z][A-Z0-9_]{1,63}$")


class UsersFile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    users: list[UserSpec]


@dataclass
class BootstrapReport:
    created: list[str] = field(default_factory=list)
    updated: list[str] = field(default_factory=list)
    kept: list[str] = field(default_factory=list)


def default_users() -> list[UserSpec]:
    return [UserSpec(uid=m.uid, display_name=m.name, role=m.role, duty_tr=m.duty_tr) for m in TEAM]


def load_users(path: Path | None, env_json: str | None = None) -> list[UserSpec]:
    """The team: TEAM, overridden by the file (YAML/JSON) or KAPTAN_BOOTSTRAP_USERS (JSON). Login needs
    the uid of every role's first member (`member_for_role`) with that role."""
    raw: Any = None
    if path is not None:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    elif env_json:
        raw = json.loads(env_json)
    if raw is None:
        return default_users()
    try:
        given = UsersFile.model_validate(raw if isinstance(raw, dict) else {"users": raw}).users
    except ValidationError as exc:
        reasons = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
        raise ConfigError(f"users file: {reasons}") from None
    by_uid = {u.uid: u for u in default_users()}
    for user in given:
        by_uid[user.uid] = user
    for role in ROLES:
        member = member_for_role(role)
        if by_uid[member.uid].role != role:
            raise ConfigError(f"users file: {member.uid} must keep the role {role} (login signs in as it)")
    return list(by_uid.values())


def password_of(user: UserSpec, environ: dict[str, str]) -> str | None:
    if user.password_env is None:
        return None
    value = environ.get(user.password_env)
    if not value:
        raise ConfigError(f"{user.password_env} (password of {user.uid}) is not set")
    if len(value) < MIN_PASSWORD_LEN:
        raise ConfigError(
            f"{user.password_env}: the password of {user.uid} needs at least {MIN_PASSWORD_LEN} characters"
        )
    return value


async def _one(conn: AsyncConnection[Any], query: str, params: Any = None) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(query, params)
        row = await cur.fetchone()
    return None if row is None else dict(row)


async def _users(
    conn: AsyncConnection[Any], users: list[UserSpec], environ: dict[str, str], rep: BootstrapReport
) -> None:
    for order, user in enumerate(users, start=1):
        password = password_of(user, environ)
        row = await _one(
            conn, "SELECT display_name, role, duty_tr, password_hash FROM auth.users WHERE uid = %s", (user.uid,)
        )
        new_hash: str | None = None
        if password is not None:
            current = None if row is None else row.get("password_hash")
            new_hash = current if current and verify_hash(password, current) else hash_passphrase(password)
        if row is None:
            await conn.execute(
                "INSERT INTO auth.users (uid, display_name, role, duty_tr, ord, password_hash) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (user.uid, user.display_name, user.role, user.duty_tr, order, new_hash),
            )
            rep.created.append(f"user:{user.uid}")
            continue
        same = (row["display_name"], row["role"], row["duty_tr"]) == (user.display_name, user.role, user.duty_tr)
        if same and (password is None or new_hash == row.get("password_hash")):
            rep.kept.append(f"user:{user.uid}")
            continue
        await conn.execute(
            "UPDATE auth.users SET display_name = %s, role = %s, duty_tr = %s, "
            "password_hash = coalesce(%s, password_hash) WHERE uid = %s",
            (user.display_name, user.role, user.duty_tr, new_hash, user.uid),
        )
        rep.updated.append(f"user:{user.uid}")


def _signature(role: Role, at: datetime, reason: str) -> dict[str, Any]:
    m = member_for_role(role)
    return {"uid": m.uid, "name": m.name, "role": role, "at": iso_ms(at), "reason": reason}


async def _limits(conn: AsyncConnection[Any], now: datetime, rep: BootstrapReport) -> None:
    if await _one(conn, "SELECT 1 FROM trading.limit_versions LIMIT 1") is not None:
        rep.kept.append("limits")
        return
    proposed = _signature("admin", now, "Kurulum: kanonik başlangıç limitleri.")
    decided = _signature("risk_officer", now, "Kurulum: kanonik değerlerle aynı.")
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
    users: list[UserSpec],
    *,
    environ: dict[str, str] | None = None,
    now: datetime | None = None,
    dry_run: bool = False,
) -> BootstrapReport:
    """Create what is missing, in one transaction (rolled back with `dry_run`)."""
    now = now or datetime.now(UTC)
    rep = BootstrapReport()
    env = dict(os.environ) if environ is None else environ
    tx = conn.transaction(force_rollback=dry_run)
    async with tx:
        await _users(conn, users, env, rep)
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
    parser.add_argument("--users", type=Path, help="team file (YAML/JSON: users: [{uid, display_name, role, ...}])")
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
    users = load_users(args.users, environ.get("KAPTAN_BOOTSTRAP_USERS"))
    conn = await connect(url.get_secret_value())
    try:
        rep = await bootstrap_data(conn, settings, users, environ=environ, dry_run=args.dry_run)
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
        if settings.demo_mode and args.cmd == "data":
            raise ConfigError("DEMO_MODE=true: use scripts/seed_demo.py for a demo database, not the bootstrap")
        ensure_production_ready(settings, "bootstrap")
        return run(_main(settings, args))
    except ConfigError as exc:
        print(f"bootstrap: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
