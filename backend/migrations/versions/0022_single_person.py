"""One person: the `sahip` account always exists and is the only active user.

Revision ID: 0022
Revises: 0021
Create Date: 2026-11-02

Login signs in as `sahip` and auth.refresh_tokens.uid references auth.users, so an upgraded database needs this row
without waiting for a reseed or a bootstrap. Older team rows stay (inactive): old signatures and audit records
still point at them, and nothing rewrites those.
"""

from __future__ import annotations

from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None

UP = """
INSERT INTO auth.users (uid, display_name, role, duty_tr, ord, is_active)
VALUES ('sahip', 'Sahip', 'risk_officer', '', 0, true)
ON CONFLICT (uid) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role,
  duty_tr = EXCLUDED.duty_tr, ord = EXCLUDED.ord, is_active = true;
UPDATE auth.users SET is_active = false WHERE uid <> 'sahip';
"""

DOWN = """
UPDATE auth.users SET is_active = true WHERE uid <> 'sahip';
UPDATE auth.users SET is_active = false WHERE uid = 'sahip';
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
