"""Admin surface (M3 B3): manual universe overrides.

Revision ID: 0020
Revises: 0017 (the head when this landed; numbers are package ids, not order)
Create Date: 2026-10-20

- core.universe_overrides: the Yönetici's manual include/exclude per ticker (04 §11 `/admin/universe`).
  The universe job still decides `core.universe_daily.is_eligible` by code; `universe_on()` applies the
  overrides on top (exclude wins over the rules, include only for a ticker that has a row that day).
  It survives /demo/reset (not truncated). Pending R13 removals live in `restricted_securities.detail`.
"""

from __future__ import annotations

from alembic import op

revision = "0020"
down_revision = "0017"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE core.universe_overrides (
  ticker     text PRIMARY KEY CHECK (ticker ~ '^[A-Z0-9]{3,8}$'),
  mode       text NOT NULL CHECK (mode IN ('include', 'exclude')),
  reason     text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 500),
  set_by     text NOT NULL,
  set_at     timestamptz NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON core.universe_overrides TO kaptan_app;
"""

DOWN = """
DROP TABLE IF EXISTS core.universe_overrides;
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
