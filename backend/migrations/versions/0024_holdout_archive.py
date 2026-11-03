"""The archive evidence: a sealed holdout, the one-time run's record, indexes for a full KAP archive.

Revision ID: 0024
Revises: 0023
Create Date: 2026-11-03

- core.holdout_runs: one row per kind ('main', 'completion', 06 §12.1 complete-window rule). The primary key
  is what makes "only once" true; the app role may insert and read, never update or delete.
- core.events.returns_settled_at: every horizon's window closed and what could be stored is stored, so the nightly
  job stops retrying events without prices (unlisted filers, delisted codes) forever.
- core.event_returns rows and event-memory chunks of the holdout window are deleted: 07 P7 + 12 §1 say it is
  read once, by one explicit action, and these rows are derived (the run and the nightly job recompute them).
- Partial indexes: evidence reads filter on route or classification over ~600 k archive rows.
"""

from __future__ import annotations

from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE core.holdout_runs (
  kind        text PRIMARY KEY CHECK (kind IN ('main', 'completion')),
  started_at  timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  as_of       timestamptz NOT NULL,
  actor       text NOT NULL,
  rules_hash  text NOT NULL,
  git_sha     text,
  prereg_ref  text,
  report      jsonb NOT NULL
);
GRANT SELECT, INSERT ON core.holdout_runs TO kaptan_app;
REVOKE UPDATE, DELETE, TRUNCATE ON core.holdout_runs FROM kaptan_app;

ALTER TABLE core.events ADD COLUMN returns_settled_at timestamptz;

DELETE FROM core.event_returns r USING core.events e
 WHERE e.event_id = r.event_id
   AND e.event_time >= timestamptz '2025-01-01 00:00:00+03' AND e.event_time < timestamptz '2026-11-01 00:00:00+03';
DELETE FROM rag.rag_chunks
 WHERE base_type = 'event_memory'
   AND published_at >= timestamptz '2025-01-01 00:00:00+03' AND published_at < timestamptz '2026-11-01 00:00:00+03';

CREATE INDEX disclosures_kap_cls_idx ON core.disclosures ((classification ->> 'event_type'), published_at DESC)
 WHERE origin = 'kap';
"""

DOWN = """
DROP INDEX IF EXISTS core.disclosures_kap_cls_idx;
ALTER TABLE core.events DROP COLUMN IF EXISTS returns_settled_at;
DROP TABLE IF EXISTS core.holdout_runs;
"""


def upgrade() -> None:
    op.execute(UP)


def downgrade() -> None:
    op.execute(DOWN)
