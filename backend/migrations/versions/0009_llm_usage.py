"""Live LLM usage log (M2, kaptan.llm): one row per model call, cached answers included.

Revision ID: 0009
Revises: 0007
Create Date: 2026-10-17

Follows docs/proje/07 `trading.llm_usage` with the M1 text run ids, plus `agent` (node code name) and
an estimated `cost_usd` (DeepSeek is paid). Quotas and the response cache live in Redis
(kaptan.llm.budget / cache); today's counters are mirrored into trading.quota_usage for the panel.
No personal data: the table never stores prompts, texts or names.
"""

from __future__ import annotations

from alembic import op

revision = "0009"
down_revision = "0007"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE trading.llm_usage (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  run_id     text,
  agent      text NOT NULL,
  provider   text NOT NULL,
  model_id   text,
  tokens_in  int NOT NULL CHECK (tokens_in >= 0),
  tokens_out int NOT NULL CHECK (tokens_out >= 0),
  cached     boolean NOT NULL,
  latency_ms int NOT NULL CHECK (latency_ms >= 0),
  cost_usd   numeric(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0)
);
CREATE INDEX llm_usage_at_idx ON trading.llm_usage (at);
CREATE INDEX llm_usage_run_idx ON trading.llm_usage (run_id) WHERE run_id IS NOT NULL;
GRANT SELECT, INSERT ON trading.llm_usage TO kaptan_app;
"""

DOWN = "DROP TABLE IF EXISTS trading.llm_usage;"


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
