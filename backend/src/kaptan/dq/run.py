"""`run_dq(conn, day)`: run every 07 §14 check and store one `ops.dq_results` row per check.

Each check runs in its own savepoint, so a broken check (e.g. a missing extension) is recorded as
failed with `{"error": …}` and never hides the others. Re-running a day replaces its rows
(`run_at` = the day's 21:00 Istanbul unless `now` is given).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Any, Final

from psycopg import Error as PgError
from psycopg.types.json import Jsonb

from kaptan.dq.checks import CHECKS
from kaptan.prices.calendar import IST
from kaptan.reference._sql import Conn, execute

log = logging.getLogger("kaptan.dq")

RUN_TIME: Final = time(21, 0)
UPSERT_SQL: Final = """
INSERT INTO ops.dq_results (check_code, run_at, severity, passed, observed) VALUES (%s, %s, %s, %s, %s)
ON CONFLICT (check_code, run_at) DO UPDATE SET severity = EXCLUDED.severity, passed = EXCLUDED.passed,
  observed = EXCLUDED.observed
"""


@dataclass(frozen=True, slots=True)
class DqResult:
    code: str
    severity: str
    passed: bool
    observed: dict[str, Any]


async def run_dq(conn: Conn, day: date, *, now: datetime | None = None, only: tuple[str, ...] = ()) -> list[DqResult]:
    run_at = now or datetime.combine(day, RUN_TIME, IST)
    results: list[DqResult] = []
    for code, (severity, check) in CHECKS.items():
        if only and code not in only:
            continue
        try:
            async with conn.transaction():
                passed, observed = await check(conn, day)
        except (PgError, ValueError, ArithmeticError) as exc:
            log.warning("dq %s failed to run: %s", code, type(exc).__name__)
            passed, observed = False, {"error": type(exc).__name__}
        results.append(DqResult(code, severity, passed, observed))
    async with conn.transaction():
        for r in results:
            await execute(conn, UPSERT_SQL, (r.code, run_at, r.severity, r.passed, Jsonb(r.observed)))
    bad = [r.code for r in results if not r.passed and r.severity == "error"]
    if bad:
        log.error("dq %s: error-level checks failed: %s", day, ", ".join(bad))
    return results
