# KAPtan backend (M1)

FastAPI + psycopg 3 (async, parametrised SQL) + Postgres 16/pgvector + Redis 7. Goal of M1: the panel
(`../kaptan-panel`, `NEXT_PUBLIC_API_MODE=http`) runs end-to-end on this API exactly as on its mock.
Contract: `../kaptan-panel/API.md`. Work split for the next agents: [PLAN.md](PLAN.md).

## Run

```bash
cp .env.example .env                                   # fill in passwords / JWT_SECRET
docker compose -f docker-compose.yml up -d             # Postgres :5432, Redis :6379 (127.0.0.1 only)
uv sync
uv run alembic upgrade head                            # owner role (DATABASE_OWNER_URL)
uv run python scripts/seed_demo.py                     # demo day; prints "audit verify: ok=True checked=4812"
uv run uvicorn kaptan.api.main:app --port 8000 --loop kaptan.api.loop:selector_loop
#   or: uv run python -m kaptan.api --port 8000
```

Windows: psycopg's async mode refuses the ProactorEventLoop (uvicorn's default on Windows), hence
`--loop kaptan.api.loop:selector_loop`. Linux/Docker can omit it.

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/auth/login -H "Content-Type: application/json" \
     -d '{"passphrase":"kaptan2026","role":"admin"}'
curl -s http://127.0.0.1:8000/api/v1/health
```

Panel: `NEXT_PUBLIC_API_MODE=http KAPTAN_API_ORIGIN=http://127.0.0.1:8000 npm run dev` in `kaptan-panel/`.

## Checks

```bash
uv run pytest            # unit + contract + integration (integration uses the kaptan_test database)
uv run ruff check . && uv run ruff format --check . && uv run mypy
node scripts/export_demo_fixtures.mjs        # re-export the demo day from the panel mock (deterministic)
node tests/contract/export_schemas.mjs       # re-export zod -> JSON Schema after panel schema changes
```

Integration tests skip when Postgres is down; the cross-language tests skip when `node` or
`kaptan-panel/node_modules` is missing.

## Decisions worth knowing

- **Auth.** One passphrase (argon2id `PASSPHRASE_HASH`; dev default `kaptan2026`), role = request
  (unknown → 400, none → `risk_officer`), each role maps to its team member. Access JWT HS256 15 min
  (`sub, name, role, fam, jti, iat, exp, iss, aud`), refresh = opaque token in `__Host-kaptan_rt`
  (HttpOnly, Secure, SameSite=Strict, Path=/), sha256 stored, rotated on every use, reuse revokes the
  family, 8 h absolute. `/auth/refresh` needs `X-KAPtan-CSRF: 1` and an allowed `Origin` (if sent).
  Dev over http: browsers treat `localhost`/`127.0.0.1` as secure contexts, so `Secure` + `__Host-` work
  through the panel's Next rewrite. Other plain-http hosts: `COOKIE_SECURE=false` → cookie `kaptan_rt`.
- **Errors.** Always `{"detail": "<Turkish>", "code": "<machine>"}`; 403 texts come from
  `domain/permissions.py` (`denied_reason()` = the panel's `deniedReason()`, tested against node).
- **Audit ledger.** `audit/canonical.py` reproduces `audit-chain.ts` byte for byte (JSON.stringify
  numbers/escapes/key order); the hash is computed by `audit/writer.py` under an advisory lock, not
  by a trigger. The app role (`kaptan_app`) has INSERT/SELECT only; triggers block UPDATE/DELETE/TRUNCATE
  for everyone; the demo reset/tamper use the owner connection and disable the trigger inside one transaction.
- **Demo clock.** In `DEMO_MODE` "now" = 2027-01-11 10:40Z + (wall time since seed/reset)
  (`clock.py`, `ops.demo_state.started_at`), like the panel mock.
- **M1 schema** follows `docs/proje/07` names with text ids and the Explain document as JSONB; see the
  docstring of `migrations/versions/0001_m1_core.py`.
