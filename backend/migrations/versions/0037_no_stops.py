"""No stops: put the risk state in a plain condition (agent NOSTOP).

Revision ID: 0037_no_stops
Revises: 0036_imports
Create Date: 2026-11-21

The person asked for no stopping at all: no kill switch, no restart wait, no daily loss halt, no drawdown stop.
The application no longer reads or writes any of these `trading.risk_state` columns, so they are only neutralised
here, never dropped (`kill_switch`, `kill_reason`, `kill_at`, `kill_by`, `halted_today`, `halted_on`,
`reset_started`, `reset_at`, `reset_equity`, `positions_managed_by_exit`, `daily_pnl_pct`, `drawdown_pct` stay as
unused columns; dropping them would only add risk to a live database). After this migration the row says: switch
off, nothing halted, no reset-watch, so nothing in an old database can look like a stop.

Old audit rows (`kill_switch.on`, `kill_switch.reset_started`, `kill_switch.reset`, `risk.halted`,
`risk.halt_cleared`) are never touched: history still reads and the hash chain still verifies. Limit rows for the
removed keys (`daily_loss_halt_pct`, `kill_drawdown_pct`) stay in their old versions and are simply not shown.
"""

from __future__ import annotations

from alembic import op

revision = "0037_no_stops"
down_revision = "0036_imports"
branch_labels = None
depends_on = None

UP = """
UPDATE trading.risk_state
   SET kill_switch = 'off', kill_reason = NULL, kill_at = NULL, kill_by = NULL,
       halted_today = false, halted_on = NULL,
       reset_started = NULL, reset_at = NULL, reset_equity = NULL,
       updated_at = now()
 WHERE id = 1;
"""


def upgrade() -> None:
    op.execute(UP)


def downgrade() -> None:
    """Nothing to restore: the old values were stop state that no code reads any more."""
