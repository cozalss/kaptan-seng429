"""Single-user mode (KAPTAN_SINGLE_USER): the limit-version two-person CHECK admits an audited waiver.

Revision ID: 0021
Revises: 0019
Create Date: 2026-10-30

The 0001 CHECK `decided_by.uid <> proposed_by.uid` stays the rule. A proposal decided by its own proposer
passes only inside a transaction that set `kaptan.single_user_waiver = 'on'` (SET LOCAL), which
kaptan.risk.limits does right after kaptan.auth.four_eyes wrote the `auth.single_user_waiver` audit row.
"""

from __future__ import annotations

from alembic import op

revision = "0021"
down_revision = "0019"
branch_labels = None
depends_on = None

UP = """
ALTER TABLE trading.limit_versions DROP CONSTRAINT IF EXISTS limit_versions_check;
ALTER TABLE trading.limit_versions ADD CONSTRAINT limit_versions_two_person CHECK (
  decided_by IS NULL
  OR decided_by->>'uid' <> proposed_by->>'uid'
  OR current_setting('kaptan.single_user_waiver', true) = 'on'
);
"""

DOWN = """
ALTER TABLE trading.limit_versions DROP CONSTRAINT IF EXISTS limit_versions_two_person;
ALTER TABLE trading.limit_versions ADD CONSTRAINT limit_versions_check
  CHECK (decided_by IS NULL OR decided_by->>'uid' <> proposed_by->>'uid');
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
