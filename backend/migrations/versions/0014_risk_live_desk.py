"""The risk gate sees the real desk (M3 package A2).

Revision ID: 0014
Revises: 0012
Create Date: 2026-10-20

- core.issuer_groups: ticker → company group (06 P4, R08 group cap ≤ 20 %). Seedable by hand or a data
  job; `core.issuers.group_name` is the fallback. A ticker with neither is "group unknown": the gate
  then counts the whole sector's exposure against the group cap (the tighter 20 % applies to the
  sector), the conservative reading of 06 P4. No FK to core.issuers (the demo reset truncates it).
- core.restriction_refresh: the last successful refresh of the restriction (tedbir) data per source
  (06 R04 `restrictions_as_of`). No row = the list's age is unknown = stale → R04 HOLD (no buy while
  the restrictions are unknown, 06 R04 case 5).
- trading.risk_state.halted_on: the Istanbul session the daily −1 % halt (R02) was set on, so the
  risk monitor can lift it at the next session (06 §11). NULL for the demo's seeded halts.
- trading.risk_state.reset_at / reset_equity: a confirmed kill-switch restart and the equity the monitor
  saw right after it (06 §11 step 4): the peak is not reset; a further −3 % from the reset level kills
  again, and the reset mode ends once the drawdown is back inside −2.5 %.
- trading.regime_daily: the R10 regime detector's daily rows (06 §9), the hysteresis state included.
"""

from __future__ import annotations

from alembic import op

revision = "0014"
down_revision = "0012"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE core.issuer_groups (
  ticker     text PRIMARY KEY CHECK (ticker ~ '^[A-Z0-9]{3,6}$'),
  group_name text NOT NULL CHECK (char_length(group_name) > 0),
  source     text NOT NULL DEFAULT 'manual',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.restriction_refresh (
  source       text PRIMARY KEY,
  refreshed_at timestamptz NOT NULL,
  n_rows       int NOT NULL DEFAULT 0 CHECK (n_rows >= 0)
);

ALTER TABLE trading.risk_state ADD COLUMN halted_on date,
  ADD COLUMN reset_at timestamptz,
  ADD COLUMN reset_equity double precision CHECK (reset_equity IS NULL OR reset_equity > 0);

CREATE TABLE trading.regime_daily (
  d           date PRIMARY KEY,
  crisis_raw  boolean NOT NULL,
  regime      text NOT NULL CHECK (regime IN ('normal', 'crisis')),
  calm_streak int NOT NULL CHECK (calm_streak >= 0),
  close       double precision NOT NULL CHECK (close > 0),
  sma50       double precision,
  rv20        double precision,
  rv20_p80    double precision,
  day_return  double precision,
  computed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON core.issuer_groups, core.restriction_refresh, trading.regime_daily
  TO kaptan_app;
"""

DOWN = """
DROP TABLE IF EXISTS trading.regime_daily;
ALTER TABLE trading.risk_state DROP COLUMN IF EXISTS halted_on, DROP COLUMN IF EXISTS reset_at,
  DROP COLUMN IF EXISTS reset_equity;
DROP TABLE IF EXISTS core.restriction_refresh;
DROP TABLE IF EXISTS core.issuer_groups;
"""


def upgrade() -> None:
    op.execute(UP)


def downgrade() -> None:
    op.execute(DOWN)
