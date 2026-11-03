"""Wait until this service can really start: Postgres answers with a migrated schema, Redis answers.

Runs in the backend image with its packages (backend/ops/start-when-ready.sh). "The database system is starting
up" and a Redis still loading its file are normal for the first seconds after a reboot. With WAIT_FOR_WARMUP=1
(agent_worker) it also holds until the first warm-up finished: before that the universe is empty and every
disclosure would stop at the R03 pre-gate. A database from before the warm-up marker counts through its universe.
Connection strings are never printed.
"""

from __future__ import annotations

import os
import sys
import time

import psycopg
import redis

RETRY_S = 2.0
SAY_EVERY_S = 30.0
READY_SQL = "SELECT 1 FROM public.alembic_version LIMIT 1"
WARMED_SQL = """
SELECT EXISTS (SELECT 1 FROM ops.job_runs WHERE job = 'live_warmup' AND finished_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM core.universe_daily)
"""


def blocker() -> str | None:
    """What this service is still waiting for (None = nothing)."""
    try:
        redis.Redis.from_url(os.environ["REDIS_URL"], socket_timeout=3).ping()
    except redis.RedisError as exc:
        return f"redis ({type(exc).__name__})"
    try:
        with psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=3) as conn:
            conn.execute(READY_SQL)
            if os.environ.get("WAIT_FOR_WARMUP") == "1":
                row = conn.execute(WARMED_SQL).fetchone()
                if not row or not row[0]:
                    return "the first warm-up"
    except psycopg.Error as exc:
        return f"postgres ({type(exc).__name__})"
    return None


def main() -> int:
    said = 0.0
    while True:
        waiting_for = blocker()
        if waiting_for is None:
            return 0
        now = time.monotonic()
        if now - said >= SAY_EVERY_S:
            print(f"waiting for {waiting_for}", file=sys.stderr, flush=True)
            said = now
        time.sleep(RETRY_S)


if __name__ == "__main__":
    sys.exit(main())
