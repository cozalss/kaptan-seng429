"""E2 attachments: their text, and the queue that fetches them.

Revision ID: 0025
Revises: 0024
Create Date: 2026-11-03

- `core.disclosure_attachments`: one row per file of a disclosure (`kaptan.ingest.attachments`). `status` is
  'read' (body holds the cleaned text) or 'unreadable' (reason_tr says why, in plain Turkish; body is empty).
  The stored notice body in core.disclosure_texts is not changed: a run composes both.
- `ops.attachment_fetch_queue`: same shape as ops.detail_fetch_queue. Priority 0 = a live disclosure, whose agent
  run waits for this row; higher = the explicit re-fetch job, which starts no run.
"""

from __future__ import annotations

from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE core.disclosure_attachments (
  disclosure_index  bigint NOT NULL REFERENCES core.disclosures(disclosure_index) ON DELETE CASCADE,
  obj_id            text NOT NULL,
  file_name         text NOT NULL DEFAULT '',
  file_ext          text NOT NULL DEFAULT '',
  position          smallint NOT NULL DEFAULT 0,
  status            text NOT NULL CHECK (status IN ('read', 'unreadable')),
  reason            text,
  reason_tr         text,
  body              text NOT NULL DEFAULT '',
  lang              text NOT NULL DEFAULT 'tr',
  pages             int,
  n_bytes           int NOT NULL DEFAULT 0,
  payload_sha256    bytea,
  text_sha256       bytea,
  extractor_version text NOT NULL,
  fetched_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (disclosure_index, obj_id),
  CHECK (status = 'read' OR reason_tr IS NOT NULL)
);

CREATE TABLE ops.attachment_fetch_queue (
  disclosure_index bigint PRIMARY KEY REFERENCES core.disclosures(disclosure_index) ON DELETE CASCADE,
  priority         smallint NOT NULL CHECK (priority BETWEEN 0 AND 9),
  status           text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts         int NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_error       text
);
CREATE INDEX attachment_fetch_queue_next_idx
  ON ops.attachment_fetch_queue (priority, next_attempt_at) WHERE status = 'queued';

GRANT SELECT, INSERT, UPDATE, DELETE ON core.disclosure_attachments, ops.attachment_fetch_queue TO kaptan_app;
"""

DOWN = """
DROP TABLE IF EXISTS ops.attachment_fetch_queue;
DROP TABLE IF EXISTS core.disclosure_attachments;
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
