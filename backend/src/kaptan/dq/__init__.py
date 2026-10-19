"""Data quality (07 §14) and retention (07 §15) jobs.

results = await run_dq(conn, day)              # 21:00 Istanbul: every check → ops.dq_results
stats = await run_retention(conn, now)         # nightly: prune ops.ingest_raw and old checkpoints
"""

from kaptan.dq.retention import RetentionStats, run_retention
from kaptan.dq.run import DqResult, run_dq

__all__ = ["DqResult", "RetentionStats", "run_dq", "run_retention"]
