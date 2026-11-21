"""Saved and read disclosures (agent READ).

Revision ID: 0034_reading
Revises: 0033_param_insights
Create Date: 2026-11-21

Two small tables of the person's own reading marks, additive only:
- `core.disclosure_saved`: the disclosures starred "sonra oku" (one row per disclosure).
- `core.reading_state`: one row, `read_through`: everything published up to it counts as read. "Hepsini okundu say"
  moves it to now; opening one disclosure writes `core.disclosure_read` instead, so a single read never hides
  the others. The state starts at the moment this migration runs, so the unread counter begins at zero.
The insider and buyback strip and the price statistics need no SQL: they read stored disclosures and prices.
"""

from __future__ import annotations

from alembic import op

revision = "0034_reading"
down_revision = "0033_param_insights"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE IF NOT EXISTS core.disclosure_saved (
  disclosure_index bigint PRIMARY KEY,
  saved_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS core.disclosure_read (
  disclosure_index bigint PRIMARY KEY,
  read_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS core.reading_state (
  id           smallint PRIMARY KEY CHECK (id = 1),
  read_through timestamptz NOT NULL DEFAULT now()
);
INSERT INTO core.reading_state (id, read_through) VALUES (1, now()) ON CONFLICT (id) DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.disclosure_saved, core.disclosure_read, core.reading_state TO kaptan_app;
"""


def upgrade() -> None:
    op.execute(UP)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS core.disclosure_saved, core.disclosure_read, core.reading_state")
