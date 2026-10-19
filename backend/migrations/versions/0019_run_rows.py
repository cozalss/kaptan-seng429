"""M3 B2: per-run rows: one per agent output and one per risk check (FR-19, 07 §9).

Revision ID: 0019
Revises: 0018, 0020 (merge: both branched off 0017 in M3 wave B)
Create Date: 2026-10-20

07 §9 sketches `trading.agent_outputs` and `trading.risk_checks` on uuid keys; M1 keys runs and
proposals by text ids, so these follow `trading.agent_runs(run_id)`. Both are written inside the run's
persistence transaction (kaptan.agents.run_rows); a re-run of the same run_id (demo re-inject) replaces
its rows. Nothing in the API reads them yet; `explain` stays the panel's source.
"""

from __future__ import annotations

from alembic import op

revision = "0019"
down_revision = ("0018", "0020")
branch_labels = None
depends_on = None

UP = """
CREATE TABLE trading.agent_outputs (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id         text NOT NULL REFERENCES trading.agent_runs(run_id) ON DELETE CASCADE,
  node           text NOT NULL,
  status         text NOT NULL,
  model_id       text,
  prompt_version text,
  prompt_manifest_hash text NOT NULL DEFAULT '',
  output         jsonb,
  tokens_in      int NOT NULL DEFAULT 0,
  tokens_out     int NOT NULL DEFAULT 0,
  cached         boolean NOT NULL DEFAULT false,
  latency_ms     int,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_outputs_run ON trading.agent_outputs (run_id);

CREATE TABLE trading.risk_checks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id      text NOT NULL REFERENCES trading.agent_runs(run_id) ON DELETE CASCADE,
  proposal_id text,
  phase       text NOT NULL CHECK (phase IN ('pre_trade', 'at_send')),
  rule_code   text NOT NULL,
  outcome     text NOT NULL CHECK (outcome IN ('pass', 'resize', 'reject', 'hold', 'approval_required')),
  detail      jsonb NOT NULL,
  checked_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX risk_checks_run_idx ON trading.risk_checks (run_id);
CREATE INDEX risk_checks_prop_idx ON trading.risk_checks (proposal_id) WHERE proposal_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON trading.agent_outputs, trading.risk_checks TO kaptan_app;
GRANT USAGE, SELECT ON SEQUENCE trading.agent_outputs_id_seq, trading.risk_checks_id_seq TO kaptan_app;
"""

DOWN = """
DROP TABLE IF EXISTS trading.risk_checks;
DROP TABLE IF EXISTS trading.agent_outputs;
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
