"""A reverse split's factor fits `core.corporate_actions` (TSPOR 2025-06-19: 2.15).

Revision ID: 0040_reverse_split_bound
Revises: 0039_telegram
Create Date: 2026-11-27

The factor multiplies every price before the ex-date. A bonus issue or dividend is below 1, a reverse split
(capital decrease, fewer and dearer shares) is above 1: TSPOR's 2.15 was refused by the old `factor <= 1.5`
bound and the daily price job stopped on it. The bound is now `0 < factor <= 100` (a 100:1 reverse split; a
larger factor is a data error, still refused). Downgrade puts the old bound back as NOT VALID, so rows stored
under the wide bound are kept and only new rows are checked.
"""

from __future__ import annotations

from alembic import op

revision = "0040_reverse_split_bound"
down_revision = "0039_telegram"
branch_labels = None
depends_on = None

UP = """
ALTER TABLE core.corporate_actions DROP CONSTRAINT IF EXISTS corporate_actions_factor_check;
ALTER TABLE core.corporate_actions ADD CONSTRAINT corporate_actions_factor_check
  CHECK (factor > 0 AND factor <= 100);
"""

DOWN = """
ALTER TABLE core.corporate_actions DROP CONSTRAINT IF EXISTS corporate_actions_factor_check;
ALTER TABLE core.corporate_actions ADD CONSTRAINT corporate_actions_factor_check
  CHECK (factor > 0 AND factor <= 1.5) NOT VALID;
"""


def upgrade() -> None:
    op.execute(UP)


def downgrade() -> None:
    op.execute(DOWN)
