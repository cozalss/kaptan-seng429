"""One meaning of "important": the summary-line cache and the triage state of a disclosure.

Revision ID: 0038_signal
Revises: 0037_no_stops
Create Date: 2026-11-24

- `core.signal_line`: the one-line Turkish summary a model wrote for an important disclosure, keyed by the
  disclosure and the prompt version (a new prompt writes new rows, old ones stay). Only a validated answer is
  stored; a failure stores nothing and the line falls back to the rule-made line.
- `core.disclosure_triage`: where the person put an important disclosure: `yapilacak` (act), `sonra` (read later)
  or `tamam` (done). The old "sonra oku" star is the same thing as `sonra`: existing stars are copied in, and
  `core.disclosure_saved` is no longer written (kept, never dropped).
Additive only.
"""

from __future__ import annotations

from alembic import op

revision = "0038_signal"
down_revision = "0037_no_stops"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE IF NOT EXISTS core.signal_line (
  disclosure_index bigint NOT NULL,
  prompt_version   text NOT NULL,
  line             text NOT NULL,
  tone             text NOT NULL CHECK (tone IN ('olumlu', 'olumsuz', 'notr', 'belirsiz')),
  so_what          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (disclosure_index, prompt_version)
);
CREATE TABLE IF NOT EXISTS core.disclosure_triage (
  disclosure_index bigint PRIMARY KEY,
  state            text NOT NULL CHECK (state IN ('yapilacak', 'sonra', 'tamam')),
  set_at           timestamptz NOT NULL DEFAULT now()
);
INSERT INTO core.disclosure_triage (disclosure_index, state, set_at)
SELECT disclosure_index, 'sonra', saved_at FROM core.disclosure_saved
ON CONFLICT (disclosure_index) DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.signal_line, core.disclosure_triage TO kaptan_app;
"""


def upgrade() -> None:
    op.execute(UP)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS core.signal_line, core.disclosure_triage")
