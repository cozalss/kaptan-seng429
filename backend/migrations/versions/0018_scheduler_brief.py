"""M3 B1: the scheduler's run log and the morning brief.

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-20

- `ops.job_runs`: one row per scheduler job run (kaptan.workers.scheduler). `slot` is the day
  (YYYY-MM-DD) of a daily job or the Istanbul minute (YYYY-MM-DDTHH:MM) of an interval job; a finished
  row for (job, slot) means "done", so a restart catches a missed daily job up once, the same day, and
  never runs it twice. `summary` is the job's small JSON result; `error_class` is only the exception
  class name (never a message, which may carry a URL or a key).
- `ops.morning_briefs`: the 08:45 morning brief (FR-35), a MorningBrief JSON document per day.
"""

from __future__ import annotations

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE ops.job_runs (
  id          bigserial PRIMARY KEY,
  job         text NOT NULL,
  slot        text NOT NULL,
  trigger     text NOT NULL CHECK (trigger IN ('schedule', 'catchup', 'manual')),
  started_at  timestamptz NOT NULL,
  finished_at timestamptz,
  ok          boolean,
  summary     jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_class text,
  CHECK (finished_at IS NULL OR ok IS NOT NULL)
);
CREATE INDEX job_runs_job_slot_idx ON ops.job_runs (job, slot);
CREATE INDEX job_runs_started_idx ON ops.job_runs (started_at DESC);

CREATE TABLE ops.morning_briefs (
  d            date PRIMARY KEY,
  generated_at timestamptz NOT NULL,
  doc          jsonb NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.job_runs, ops.morning_briefs TO kaptan_app;
GRANT USAGE, SELECT ON SEQUENCE ops.job_runs_id_seq TO kaptan_app;
"""

DOWN = """
DROP TABLE IF EXISTS ops.morning_briefs;
DROP TABLE IF EXISTS ops.job_runs;
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
