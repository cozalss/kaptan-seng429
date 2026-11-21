"""Pause, alert preferences, quiet hours, a changeable password and "back up now" (agent COMFORT).

Revision ID: 0031_comfort
Revises: 0030_reports
Create Date: 2026-11-21

Three one-row tables (`id = 1`), all additive:
- `auth.credentials`: the password hash the person set in the app. NULL = none set there, `PASSPHRASE_HASH` from
  the environment is the password. Once set it takes precedence; the installer (kur.ps1) clears it when it sets a
  new password, so the last change always wins.
- `ops.preferences`: `pause_until` / `pause_since` (Tatil modu: the agent feed starts no run while it is in the
  future) and `alerts` (which alert goes where, and the quiet hours; NULL = every kind on, no quiet hours).
- `ops.backup_request`: "Şimdi yedek al". The API writes `requested_at`; the backup container's loop picks it up,
  stamps `started_at`, runs the backup and stamps `finished_at` / `ok`.
"""

from __future__ import annotations

from alembic import op

revision = "0031_comfort"
down_revision = "0030_reports"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE auth.credentials (
  id              smallint PRIMARY KEY CHECK (id = 1),
  passphrase_hash text CHECK (passphrase_hash IS NULL OR left(passphrase_hash, 7) = '$argon2'),
  changed_at      timestamptz
);
INSERT INTO auth.credentials (id) VALUES (1);

CREATE TABLE ops.preferences (
  id          smallint PRIMARY KEY CHECK (id = 1),
  pause_until timestamptz,
  pause_since timestamptz,
  alerts      jsonb,
  updated_at  timestamptz
);
INSERT INTO ops.preferences (id) VALUES (1);

CREATE TABLE ops.backup_request (
  id           smallint PRIMARY KEY CHECK (id = 1),
  requested_at timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  ok           boolean
);
INSERT INTO ops.backup_request (id) VALUES (1);

GRANT SELECT, UPDATE ON auth.credentials, ops.preferences, ops.backup_request TO kaptan_app;
"""

DOWN = """
DROP TABLE IF EXISTS ops.backup_request;
DROP TABLE IF EXISTS ops.preferences;
DROP TABLE IF EXISTS auth.credentials;
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
