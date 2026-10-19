"""M3 A5 ops: the app role may read the schema version (/readyz), team users may carry a password hash.

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-20

- `GRANT SELECT ON public.alembic_version TO kaptan_app`: `/readyz` and the API's startup check compare
  the database revision with the code's head as the app role (read only).
- `auth.users.password_hash` (argon2id, nullable): `python -m kaptan.bootstrap` stores a per-person
  password hash when the users file gives one (09 §6). Login still checks the single PASSPHRASE_HASH
  (API.md §2); nothing reads this column yet.
"""

from __future__ import annotations

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

UP = """
GRANT SELECT ON public.alembic_version TO kaptan_app;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS password_hash text
  CHECK (password_hash IS NULL OR left(password_hash, 7) = '$argon2');
"""

DOWN = """
ALTER TABLE auth.users DROP COLUMN IF EXISTS password_hash;
REVOKE SELECT ON public.alembic_version FROM kaptan_app;
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
