"""Closed trades, risk stats, notes per holding (agent PARAM).

Revision ID: 0033_param_insights
Revises: 0032_calendar
Create Date: 2026-11-21

Two small tables, additive only: `trading.holding_notes` (the person's private note per share, "neden aldım") and
`trading.insight_settings` (one key per setting; today only the concentration threshold). Everything else on the
Param screen is derived from the ledger, the stored closes and the stored exchange rates.
"""

from __future__ import annotations

from alembic import op

revision = "0033_param_insights"
down_revision = "0032_calendar"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE IF NOT EXISTS trading.holding_notes (
  ticker     text PRIMARY KEY CHECK (ticker ~ '^[A-Z0-9]{3,6}$'),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 500),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS trading.insight_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON trading.holding_notes, trading.insight_settings TO kaptan_app;
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql("DROP TABLE IF EXISTS trading.holding_notes, trading.insight_settings")
