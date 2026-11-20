"""One book, the person's own: the money ledger, hand-entered holdings, the commission on a ticket.

Revision ID: 0026_own_book
Revises: 0025
Create Date: 2026-11-19

- `trading.book_ledger`: every movement of the person's book, in order. `start` / `deposit` / `withdrawal` move
  cash and the money put in; `holding` (a share owned before KAPtan) raises the money put in by its cost and
  adds shares without touching cash; `buy` / `sell` are the real fills the person recorded (cash moves by
  `qty × price ± commission`). Cash, the shares held and the money put in at any moment are sums over it
  (`kaptan.risk.book`). `flow_try` + `equity_before` let the day-start level and the peak follow a deposit or a
  withdrawal, so neither is ever a gain or a loss.
- `trading.positions.origin`: 'suggestion' (a ticket the person entered) or 'own' (added by hand: no proposal,
  no run, no event type; KAPtan raises no exit for it).
- `trading.order_tickets`: the commission of the recorded fill (typed or estimated) and `late` (recorded after
  `valid_until`: still the person's real fill).
- The simulated paper desk goes: its open positions and its P&L series (and the baselines chained from its
  1 000 000 TL) are deleted; the person's series starts at their first close. Positions a person had already
  recorded from tickets stay and join the ledger at cost, like a hand-entered holding.
"""

from __future__ import annotations

from alembic import op

revision = "0026_own_book"
down_revision = "0025"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE trading.book_ledger (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind                 text NOT NULL CHECK (kind IN ('start', 'deposit', 'withdrawal', 'holding', 'buy', 'sell')),
  occurred_at          timestamptz NOT NULL,      -- when it took effect in the book (a fill: the real fill time)
  recorded_at          timestamptz NOT NULL,
  amount_try           numeric(18,2) NOT NULL CHECK (amount_try > 0),
  cash_delta           numeric(18,2) NOT NULL,
  capital_delta        numeric(18,2) NOT NULL DEFAULT 0,
  flow_try             numeric(18,2) NOT NULL DEFAULT 0,   -- outside money at market value (0 for a fill)
  equity_before        numeric(18,2),                      -- the book's equity just before an outside flow
  ticker               text,
  qty_delta            int NOT NULL DEFAULT 0,
  price                numeric(18,6) CHECK (price IS NULL OR price > 0),
  commission_try       numeric(18,2) NOT NULL DEFAULT 0 CHECK (commission_try >= 0),
  commission_estimated boolean NOT NULL DEFAULT false,
  position_id          bigint,
  ticket_no            text REFERENCES trading.order_tickets(ticket_no),
  note                 text NOT NULL DEFAULT '',
  CHECK ((kind IN ('holding', 'buy', 'sell')) = (ticker IS NOT NULL)),
  CHECK (kind NOT IN ('buy', 'sell') OR (flow_try = 0 AND capital_delta = 0))
);
CREATE UNIQUE INDEX book_ledger_one_start ON trading.book_ledger (kind) WHERE kind = 'start';
CREATE INDEX book_ledger_time_idx ON trading.book_ledger (occurred_at, id);

DELETE FROM trading.positions WHERE book = 'paper';
DELETE FROM trading.pnl_daily;
UPDATE trading.risk_state SET daily_pnl_pct = 0, drawdown_pct = 0;

ALTER TABLE trading.positions
  ADD COLUMN origin text NOT NULL DEFAULT 'suggestion' CHECK (origin IN ('suggestion', 'own')),
  ALTER COLUMN source_proposal DROP NOT NULL,
  ALTER COLUMN run_id DROP NOT NULL,
  ALTER COLUMN event_type DROP NOT NULL,
  ADD CONSTRAINT positions_origin_shape CHECK ((origin = 'suggestion') = (source_proposal IS NOT NULL));

INSERT INTO trading.book_ledger (kind, occurred_at, recorded_at, amount_try, cash_delta, capital_delta, flow_try,
  ticker, qty_delta, price, position_id, note)
SELECT 'holding', now(), now(), round((qty * avg_cost)::numeric, 2), 0, round((qty * avg_cost)::numeric, 2),
       round((qty * avg_cost)::numeric, 2), ticker, qty, avg_cost::numeric, id, ''
  FROM trading.positions ORDER BY opened_at, id;

ALTER TABLE trading.order_tickets
  ADD COLUMN commission_try numeric(18,2) CHECK (commission_try IS NULL OR commission_try >= 0),
  ADD COLUMN commission_estimated boolean NOT NULL DEFAULT false,
  ADD COLUMN late boolean NOT NULL DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON trading.book_ledger TO kaptan_app;
"""

DOWN = """
ALTER TABLE trading.order_tickets DROP COLUMN IF EXISTS late, DROP COLUMN IF EXISTS commission_estimated,
  DROP COLUMN IF EXISTS commission_try;
DELETE FROM trading.positions WHERE origin = 'own';
ALTER TABLE trading.positions
  DROP CONSTRAINT IF EXISTS positions_origin_shape,
  ALTER COLUMN event_type SET NOT NULL,
  ALTER COLUMN run_id SET NOT NULL,
  ALTER COLUMN source_proposal SET NOT NULL,
  DROP COLUMN IF EXISTS origin;
DROP TABLE IF EXISTS trading.book_ledger;
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
