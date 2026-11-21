"""Importing broker and MKK statements (agent IMPORT).

Revision ID: 0036_imports
Revises: 0035_price_alerts
Create Date: 2026-11-21

Two additive tables. A statement file itself is parsed in memory and never stored; only what is needed to
make an import idempotent and repeatable is kept:
- `trading.import_rows`: one SHA-256 hash per imported row (date, kind, share, quantity, price, commission, amount
  and its place among identical rows of the file), per book. Importing the same file twice finds every hash and adds
  nothing. No file content, no names, no account numbers.
- `trading.import_mappings`: the column mapping the person confirmed for a source name ("Midas ekstresi"), so the
  next file of that source is mapped in one click. Only column numbers and the person's own labels for type words.
"""

from __future__ import annotations

from alembic import op

revision = "0036_imports"
down_revision = "0035_price_alerts"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE trading.import_rows (
  book_no    integer     NOT NULL,
  row_hash   text        NOT NULL CHECK (row_hash ~ '^[0-9a-f]{64}$'),
  source     text        NOT NULL CHECK (char_length(source) BETWEEN 1 AND 40),
  kind       text        NOT NULL,
  applied_at timestamptz NOT NULL,
  PRIMARY KEY (book_no, row_hash)
);

CREATE TABLE trading.import_mappings (
  source     text PRIMARY KEY CHECK (char_length(source) BETWEEN 1 AND 40),
  mapping    jsonb       NOT NULL,
  header_key text        NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL
);

GRANT SELECT, INSERT ON trading.import_rows TO kaptan_app;
GRANT SELECT, INSERT, UPDATE ON trading.import_mappings TO kaptan_app;
"""

DOWN = """
DROP TABLE IF EXISTS trading.import_mappings;
DROP TABLE IF EXISTS trading.import_rows;
"""


def upgrade() -> None:
    op.execute(UP)


def downgrade() -> None:
    op.execute(DOWN)
