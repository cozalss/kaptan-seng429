"""Orders really execute and exit (M3 package A3): SimBIST open fills, exits X1–X6, shadow returns, live arm.

Revision ID: 0015
Revises: 0014 (the head when this landed; numbers are package ids, not order)
Create Date: 2026-10-20

- trading.orders.miss_reason: why a SimBIST order did not fill (06 §5 "missed", no retry). The panel's
  `cancel_reason` enum is part of the API contract, so the finer reason lives here: open_above_limit /
  open_below_limit (→ cancel_reason day_end), limit_up_open (→ limit_up_open), limit_down_open
  (status rejected), no_price, day_end. `filled_by` = the job that filled it (demo_timer | open_fill |
  eod_fill | intraday).
- trading.positions: the live stop (`stop_price`, raised to break-even by X6, `stop_moved_at`) and the
  stop distance at entry (`stop_pct`). Closed positions leave the table (it holds open positions only,
  which every reader assumes) and land in trading.closed_positions with the exit fill and rule.
- trading.exit_signals: one row per exit proposal the EOD job raised (X1–X4), idempotent per position,
  rule and evaluation day; the SELL fill or ticket mark finds its position through it.
- trading.symbol_cooldowns: P8, no new entry in a symbol for 10 sessions after a stop (X2) exit.
- trading.shadow_signals: FR-43 / 08 §4, every rejected or expired signal with its reason code and its
  5- and 20-session hypothetical (shadow) return and excess return over XU100.
- trading.live_arm: the UI key's two signatures (admin starts, risk officer confirms, 09 §8).
Every new table hangs off trading.trade_proposals / agent_runs with ON DELETE CASCADE, so the demo
reset (TRUNCATE … CASCADE) empties them too.
"""

from __future__ import annotations

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

UP = """
ALTER TABLE trading.orders
  ADD COLUMN miss_reason text CHECK (miss_reason IN ('open_above_limit', 'open_below_limit', 'limit_up_open',
                                                     'limit_down_open', 'no_price', 'day_end')),
  ADD COLUMN filled_by   text CHECK (filled_by IN ('demo_timer', 'open_fill', 'eod_fill', 'intraday'));

ALTER TABLE trading.positions
  ADD COLUMN stop_price    double precision CHECK (stop_price IS NULL OR stop_price > 0),
  ADD COLUMN stop_pct      double precision CHECK (stop_pct IS NULL OR (stop_pct > 0 AND stop_pct < 1)),
  ADD COLUMN stop_moved_at timestamptz;

CREATE TABLE trading.closed_positions (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  book             text NOT NULL CHECK (book IN ('paper', 'personal')),
  ticker           text NOT NULL,
  qty              int  NOT NULL CHECK (qty > 0),
  avg_cost         double precision NOT NULL CHECK (avg_cost > 0),
  exit_price       double precision NOT NULL CHECK (exit_price > 0),
  realized_pnl     double precision NOT NULL,
  opened_at        timestamptz NOT NULL,
  closed_at        timestamptz NOT NULL,
  source_proposal  text NOT NULL REFERENCES trading.trade_proposals(proposal_id) ON DELETE CASCADE,
  exit_proposal    text NOT NULL REFERENCES trading.trade_proposals(proposal_id) ON DELETE CASCADE,
  exit_rule        text NOT NULL CHECK (exit_rule IN ('X1', 'X2', 'X3', 'X4')),
  event_type       text NOT NULL,
  strategy_version text NOT NULL
);
CREATE INDEX closed_positions_ticker_idx ON trading.closed_positions (ticker, closed_at DESC);

CREATE TABLE trading.exit_signals (
  proposal_id     text PRIMARY KEY REFERENCES trading.trade_proposals(proposal_id) ON DELETE CASCADE,
  source_proposal text NOT NULL REFERENCES trading.trade_proposals(proposal_id) ON DELETE CASCADE,
  ticker          text NOT NULL,
  rule            text NOT NULL CHECK (rule IN ('X1', 'X2', 'X3', 'X4')),
  evaluated_on    date NOT NULL,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL,
  UNIQUE (source_proposal, rule, evaluated_on)
);
CREATE INDEX exit_signals_source_idx ON trading.exit_signals (source_proposal, created_at DESC);

CREATE TABLE trading.symbol_cooldowns (
  ticker          text NOT NULL,
  until_day       date NOT NULL,
  reason          text NOT NULL CHECK (reason IN ('X2_STOP')),
  exit_proposal   text NOT NULL REFERENCES trading.trade_proposals(proposal_id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL,
  PRIMARY KEY (ticker, exit_proposal)
);

CREATE TABLE trading.shadow_signals (
  signal_id      text PRIMARY KEY,
  run_id         text NOT NULL REFERENCES trading.agent_runs(run_id) ON DELETE CASCADE,
  proposal_id    text REFERENCES trading.trade_proposals(proposal_id) ON DELETE CASCADE,
  ticker         text NOT NULL,
  event_type     text NOT NULL CHECK (event_type IN ('E1', 'E2', 'E3', 'E4')),
  strategy_version text NOT NULL,
  reason_code    text NOT NULL CHECK (reason_code ~ '^[A-Z0-9_]+$'),
  reason_source  text NOT NULL CHECK (reason_source IN ('risk_gate', 'compliance', 'skeptic', 'risk_officer',
                                                        'expired')),
  decided_at     timestamptz NOT NULL,
  entry_day      date NOT NULL,
  return_5d      double precision,
  excess_5d      double precision,
  return_20d     double precision,
  excess_20d     double precision,
  computed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shadow_signals_open_idx ON trading.shadow_signals (entry_day) WHERE return_20d IS NULL;

ALTER TABLE trading.live_arm
  ADD COLUMN arm_started jsonb,
  ADD COLUMN armed_by    jsonb,
  ADD COLUMN updated_at  timestamptz;

GRANT SELECT, INSERT, UPDATE, DELETE ON trading.closed_positions, trading.exit_signals, trading.symbol_cooldowns,
  trading.shadow_signals TO kaptan_app;
"""

DOWN = """
ALTER TABLE trading.live_arm DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS armed_by,
  DROP COLUMN IF EXISTS arm_started;
DROP TABLE IF EXISTS trading.shadow_signals;
DROP TABLE IF EXISTS trading.symbol_cooldowns;
DROP TABLE IF EXISTS trading.exit_signals;
DROP TABLE IF EXISTS trading.closed_positions;
ALTER TABLE trading.positions DROP COLUMN IF EXISTS stop_moved_at, DROP COLUMN IF EXISTS stop_pct,
  DROP COLUMN IF EXISTS stop_price;
ALTER TABLE trading.orders DROP COLUMN IF EXISTS filled_by, DROP COLUMN IF EXISTS miss_reason;
"""


def upgrade() -> None:
    op.execute(UP)


def downgrade() -> None:
    op.execute(DOWN)
