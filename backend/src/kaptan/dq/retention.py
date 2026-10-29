"""`run_retention(conn, now)` (07 §15): keep the operational tables from growing without bound.

- `ops.ingest_raw` (raw KAP list payloads, one row per changed payload): rows older than 180 days go,
  **except the newest payload of each (source, natural_key)** ("180 gün, sonra yalnızca en son yük").
- LangGraph checkpoints (`agent_ckpt.checkpoints`, `checkpoint_blobs`, `checkpoint_writes`): threads of
  runs that finished more than 90 days ago (thread id = run id; `ops.agent_feed` done / failed /
  skipped, or `trading.agent_runs` completed). Parked runs (waiting for approval) are never pruned here;
  the agent worker's settling closes them first. The decision record stays in `trading.*` and the audit
  ledger, which are kept forever.
- `ops.job_runs` (the scheduler's run log, migration 0018): rows started more than `JOB_RUNS_KEEP_DAYS`
  days ago (default 90, setting `JOB_RUNS_KEEP_DAYS`, never below 7) go. The scheduler only reads the last
  two days of it (`done_slots`), so pruning never makes a finished slot run again.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Final

from kaptan.reference._sql import Conn, execute, fetch_one

RAW_KEEP: Final = timedelta(days=180)
CHECKPOINT_KEEP: Final = timedelta(days=90)
JOB_RUNS_KEEP_DAYS: Final = 90
MIN_JOB_RUNS_KEEP_DAYS: Final = 7
CKPT_TABLES: Final = ("checkpoint_writes", "checkpoint_blobs", "checkpoints")

PRUNE_RAW_SQL: Final = """
DELETE FROM ops.ingest_raw r
 WHERE r.fetched_at < %s
   AND EXISTS (SELECT 1 FROM ops.ingest_raw n
                WHERE n.source = r.source AND n.natural_key = r.natural_key
                  AND (n.fetched_at > r.fetched_at OR (n.fetched_at = r.fetched_at AND n.id > r.id)))
"""
#: Finished threads (run ids) older than the cut-off.
FINISHED_SQL: Final = """
SELECT array_agg(DISTINCT run_id) AS ids FROM (
  SELECT run_id FROM ops.agent_feed
   WHERE run_id IS NOT NULL AND status IN ('done', 'failed', 'skipped') AND finished_at < %(cut)s
  UNION
  SELECT run_id FROM trading.agent_runs WHERE status = 'completed' AND finished_at < %(cut)s
) f
"""
PRUNE_JOB_RUNS_SQL: Final = "DELETE FROM ops.job_runs WHERE started_at < %s"
CKPT_EXISTS_SQL: Final = "SELECT to_regclass('agent_ckpt.checkpoints') IS NOT NULL AS ok"


@dataclass(frozen=True, slots=True)
class RetentionStats:
    ingest_raw: int
    checkpoint_rows: int
    threads: int
    job_runs: int = 0


async def run_retention(conn: Conn, now: datetime, *, job_runs_keep_days: int = JOB_RUNS_KEEP_DAYS) -> RetentionStats:
    if job_runs_keep_days < MIN_JOB_RUNS_KEEP_DAYS:
        raise ValueError(f"job_runs_keep_days must be >= {MIN_JOB_RUNS_KEEP_DAYS}")
    async with conn.transaction():
        raw = await execute(conn, PRUNE_RAW_SQL, (now - RAW_KEEP,))
        job_runs = await execute(conn, PRUNE_JOB_RUNS_SQL, (now - timedelta(days=job_runs_keep_days),))
        ckpt, threads = 0, 0
        exists = await fetch_one(conn, CKPT_EXISTS_SQL)
        row = await fetch_one(conn, FINISHED_SQL, {"cut": now - CHECKPOINT_KEEP}) if exists and exists["ok"] else None
        ids = list((row or {}).get("ids") or [])
        if ids:
            threads = len(ids)
            for table in CKPT_TABLES:  # constant table names; the ids are bound parameters
                ckpt += await execute(conn, f"DELETE FROM agent_ckpt.{table} WHERE thread_id = ANY(%s::text[])", (ids,))  # noqa: S608
    return RetentionStats(raw, ckpt, threads, job_runs)
