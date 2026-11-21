"""The person's watchlist (agent INSIGHT).

Revision ID: 0029_watchlist
Revises: 0028_corporate_actions
Create Date: 2026-11-21

The person's own list of companies to follow reuses `core.watchlist` (ticker, ord; the universe view already
reads it) and adds when each one was starred. Search indexes: trigram on the issuer names. Additive only.
"""

from __future__ import annotations

from alembic import op

revision = "0029_watchlist"
down_revision = "0028_corporate_actions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE core.watchlist ADD COLUMN IF NOT EXISTS added_at timestamptz NOT NULL DEFAULT now()")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON core.watchlist TO kaptan_app")


def downgrade() -> None:
    op.execute("ALTER TABLE core.watchlist DROP COLUMN IF EXISTS added_at")
