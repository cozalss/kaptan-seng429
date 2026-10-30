#!/bin/sh
# Picks the process of the KAPtan image (api | ingest_worker | agent_worker | scheduler | migrate | bootstrap |
# dlq | seed_demo | live_warmup). Anything unknown is executed as given (e.g. `sh`).
set -eu
cmd="${1:-api}"
[ "$#" -gt 0 ] && shift
case "$cmd" in
  api)
    exec python -m kaptan.ops.serve "$@" ;;
  ingest_worker|agent_worker|scheduler)
    exec python -m "kaptan.workers.$cmd" "$@" ;;
  migrate)
    exec python -m kaptan.ops.migrate "$@" ;;
  bootstrap)
    exec python -m kaptan.bootstrap "$@" ;;
  live_warmup)
    # live.env first start: recent KAP days, issuer list, price history, universe, flat P&L days (once).
    exec python -m kaptan.live.warmup "$@" ;;
  dlq)
    exec python -m kaptan.ops.dlq "$@" ;;
  seed_demo)
    # Local stack (root docker-compose.yml): with DEMO_MODE=true load the recorded demo day once (owner
    # role), then walk the audit chain; an already seeded database is kept, `seed_demo --force` replaces it
    # (= POST /demo/reset). With DEMO_MODE off the production bootstrap runs instead (team, limits v1, ...).
    case "$(printf '%s' "${DEMO_MODE:-false}" | tr '[:upper:]' '[:lower:]')" in
      true|1|yes|on) ;;
      *) echo "seed_demo: DEMO_MODE is off, running the bootstrap instead"; exec python -m kaptan.bootstrap ;;
    esac
    exec python - "$@" <<'PY'
import sys

from kaptan.api.loop import run
from kaptan.audit.verify import verify_db
from kaptan.db import connect
from kaptan.demo.seed import reseed
from kaptan.domain.schemas import iso_ms
from kaptan.settings import get_settings


async def main(force: bool) -> int:
    url = get_settings().database_owner_url
    if url is None:
        print("seed_demo: DATABASE_OWNER_URL is not set", file=sys.stderr)
        return 2
    conn = await connect(url.get_secret_value())
    try:
        row = await (await conn.execute("SELECT count(*) AS n FROM ops.demo_state")).fetchone()
        if row and row["n"] and not force:
            print("seed_demo: demo day already present, kept (seed_demo --force replaces it)")
            return 0
        result = await reseed(conn)
        verdict = await verify_db(conn, iso_ms(result.started_at))
        await conn.commit()
    finally:
        await conn.close()
    print(f"seed_demo: {sum(result.counts.values())} rows, audit verify ok={verdict['ok']} checked={verdict['checked']}")
    return 0 if verdict["ok"] else 1


sys.exit(run(main("--force" in sys.argv[1:])))
PY
    ;;
  *)
    exec "$cmd" "$@" ;;
esac
