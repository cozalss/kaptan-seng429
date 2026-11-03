"""The agent feed loses nothing to its cap: `capped` becomes `deferred` / `window_closed` / `expired_unrun`.

Revision ID: 0023
Revises: 0022
Create Date: 2026-11-03

`capped` was terminal and nothing re-drove it. Those rows are not re-run blindly: their disclosures are old, so they
end as `expired_unrun` with reason `legacy_capped:<old reason>`. Rows stuck for two weeks (no window lasts that long,
a bayram included) end the same way; a newer one is left to the worker, which knows its real entry window.
`updated_at` stays as it was: the day's counts report what happened that day, not this upgrade.
"""

from __future__ import annotations

from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None

UP = """
ALTER TABLE ops.agent_feed DROP CONSTRAINT agent_feed_status_check;
UPDATE ops.agent_feed SET status = 'expired_unrun', reason = 'legacy_capped:' || coalesce(reason, 'unknown')
 WHERE status = 'capped';
UPDATE ops.agent_feed f
   SET status = 'expired_unrun', reason = CASE f.status WHEN 'running' THEN 'interrupted' ELSE 'no_text' END
  FROM core.disclosures d
 WHERE d.disclosure_index = f.disclosure_index AND f.status IN ('awaiting_text', 'running')
   AND d.published_at < now() - interval '14 days';
ALTER TABLE ops.agent_feed ADD CONSTRAINT agent_feed_status_check
  CHECK (status IN ('awaiting_text', 'running', 'waiting_approval', 'done', 'skipped', 'failed',
                    'deferred', 'window_closed', 'expired_unrun'));
CREATE INDEX agent_feed_open_idx ON ops.agent_feed (status) WHERE status IN ('deferred', 'awaiting_text', 'running');
CREATE INDEX agent_feed_updated_idx ON ops.agent_feed (updated_at);
"""

DOWN = """
DROP INDEX IF EXISTS ops.agent_feed_updated_idx;
DROP INDEX IF EXISTS ops.agent_feed_open_idx;
ALTER TABLE ops.agent_feed DROP CONSTRAINT agent_feed_status_check;
UPDATE ops.agent_feed SET status = 'capped' WHERE status IN ('deferred', 'window_closed', 'expired_unrun');
ALTER TABLE ops.agent_feed ADD CONSTRAINT agent_feed_status_check
  CHECK (status IN ('awaiting_text', 'running', 'waiting_approval', 'done', 'skipped', 'capped', 'failed'));
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
