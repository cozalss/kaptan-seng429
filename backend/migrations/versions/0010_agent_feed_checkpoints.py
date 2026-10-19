"""KAP → agent feed state and the durable LangGraph checkpointer (M2 step 2).

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-18

- ops.agent_feed: one row per KAP disclosure the agent worker has seen (idempotency key =
  disclosure_index). `status` = awaiting_text | running | waiting_approval | done | skipped | capped |
  failed; `reason` says why a row was skipped or capped. Cascades with core.disclosures, so the demo
  reset (TRUNCATE … CASCADE) empties it too.
- schema `agent_ckpt`: the tables of `langgraph-checkpoint-postgres` (AsyncPostgresSaver), created here by
  the owner role with exactly the statements its `setup()` runs (the library's own MIGRATIONS list,
  recorded in `checkpoint_migrations`), so the app role never needs CREATE. The saver connects with
  `search_path=agent_ckpt` (kaptan.agents.checkpoint). `CREATE INDEX CONCURRENTLY` cannot run in the
  migration's transaction; on these new, empty tables a plain CREATE INDEX is the same thing.
"""

from __future__ import annotations

from alembic import op
from langgraph.checkpoint.postgres.base import BasePostgresSaver

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

CKPT_SCHEMA = "agent_ckpt"

UP = """
CREATE TABLE ops.agent_feed (
  disclosure_index bigint PRIMARY KEY REFERENCES core.disclosures(disclosure_index) ON DELETE CASCADE,
  status      text NOT NULL CHECK (status IN ('awaiting_text', 'running', 'waiting_approval', 'done', 'skipped',
                                              'capped', 'failed')),
  reason      text,
  run_id      text,
  attempts    int NOT NULL DEFAULT 0,
  llm_calls   int NOT NULL DEFAULT 0,
  stream_id   text,
  seen_at     timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_feed_started_idx ON ops.agent_feed (started_at) WHERE started_at IS NOT NULL;
CREATE INDEX agent_feed_waiting_idx ON ops.agent_feed (status) WHERE status IN ('running', 'waiting_approval');
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.agent_feed TO kaptan_app;

CREATE SCHEMA IF NOT EXISTS agent_ckpt;
GRANT USAGE ON SCHEMA agent_ckpt TO kaptan_app;
"""

GRANTS = """
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA agent_ckpt TO kaptan_app;
"""

DOWN = """
DROP SCHEMA IF EXISTS agent_ckpt CASCADE;
DROP TABLE IF EXISTS ops.agent_feed;
"""


def _checkpoint_tables() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql(f"SET LOCAL search_path TO {CKPT_SCHEMA}")
    for version, statement in enumerate(BasePostgresSaver.MIGRATIONS):
        bind.exec_driver_sql(statement.replace(" CONCURRENTLY", ""))
        # setup() records every version, 0 included (0 = checkpoint_migrations itself).
        bind.exec_driver_sql(
            f"INSERT INTO checkpoint_migrations (v) VALUES ({int(version)}) ON CONFLICT DO NOTHING"  # noqa: S608
        )
    bind.exec_driver_sql("RESET search_path")


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)
    _checkpoint_tables()
    op.get_bind().exec_driver_sql(GRANTS)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
