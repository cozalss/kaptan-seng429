"""Suggestion track record and reports (agent REPORT).

Revision ID: 0030_reports
Revises: 0029_watchlist
Create Date: 2026-11-21

Needs no SQL: the track record, the benchmark, the Karne and the quiet-day sentence are computed on read from
tables that already exist (approvals, order tickets, the audit log, the book ledger, pnl_daily, stored prices).
XU100 is already in the daily price job and the warm-up, so no price table or job change either. Kept in the chain.
"""

from __future__ import annotations

revision = "0030_reports"
down_revision = "0029_watchlist"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
