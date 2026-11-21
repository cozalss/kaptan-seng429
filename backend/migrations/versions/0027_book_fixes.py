"""Corrections to the book: undo/correct a money movement, fix a recorded fill, start over, broker fee rate (agent BOOK).

Revision ID: 0027_book_fixes
Revises: 0026_own_book
Create Date: 2026-11-21

Additive only; the ledger stays append-only (a correction is a new row that says which row it corrects).

- `trading.book_ledger`: kinds `correction` (the amount of an earlier row changed: the row carries only the DIFFERENCE
  in cash / money put in / outside flow, so every sum over the ledger stays right; `amount_try`, `price`,
  `commission_try` and `new_qty` hold the new full values) and `reversal` (an earlier row undone). `corrects_id` points at
  the ORIGINAL row (never at another correction). `book_no` says which book a row belongs to.
- `trading.book_epochs`: one row per book. "Baştan başla" closes the current one (with what it held) and opens the next;
  nothing of the old book is deleted. Every sum over the ledger reads the newest book only.
- `trading.book_archive`: the positions, P&L series and tickets of a closed book, kept as documents (readable in Geçmiş).
- `trading.broker_fee`: the person's own broker commission rate (one row, absent = the built-in default).
- `trading.order_tickets`: `commission_rate` / `commission_rate_own` (which rate an estimated commission used) and
  `corrected_at` (the fill was fixed afterwards).
"""

from __future__ import annotations

from alembic import op

revision = "0027_book_fixes"
down_revision = "0026_own_book"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE trading.book_epochs (
  no               int PRIMARY KEY CHECK (no > 0),
  opened_at        timestamptz NOT NULL,
  closed_at        timestamptz,
  cash_at_close    numeric(18,2),
  equity_at_close  numeric(18,2),
  put_in_at_close  numeric(18,2),
  CHECK ((closed_at IS NULL) = (equity_at_close IS NULL))
);
INSERT INTO trading.book_epochs (no, opened_at)
  VALUES (1, coalesce((SELECT min(recorded_at) FROM trading.book_ledger), now()));

CREATE TABLE trading.book_archive (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  book_no  int NOT NULL REFERENCES trading.book_epochs(no),
  kind     text NOT NULL CHECK (kind IN ('position', 'pnl', 'ticket')),
  doc      jsonb NOT NULL
);
CREATE INDEX book_archive_book_idx ON trading.book_archive (book_no, kind, id);

CREATE TABLE trading.broker_fee (
  id               smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  commission_rate  numeric(8,6) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 0.01),
  updated_at       timestamptz NOT NULL
);

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'trading.book_ledger'::regclass AND contype = 'c'
       AND (position('ticker IS NOT NULL' in pg_get_constraintdef(oid)) > 0
            OR position('''start''' in pg_get_constraintdef(oid)) > 0)
  LOOP
    EXECUTE 'ALTER TABLE trading.book_ledger DROP CONSTRAINT ' || quote_ident(c.conname);
  END LOOP;
END $$;
DROP INDEX IF EXISTS trading.book_ledger_one_start;

ALTER TABLE trading.book_ledger
  ADD COLUMN book_no int NOT NULL DEFAULT 1 REFERENCES trading.book_epochs(no),
  ADD COLUMN corrects_id bigint REFERENCES trading.book_ledger(id),
  ADD COLUMN new_qty int CHECK (new_qty IS NULL OR new_qty > 0),
  ADD CONSTRAINT book_ledger_kind_ck
    CHECK (kind IN ('start', 'deposit', 'withdrawal', 'holding', 'buy', 'sell', 'correction', 'reversal')),
  ADD CONSTRAINT book_ledger_ticker_ck
    CHECK (kind NOT IN ('holding', 'buy', 'sell') OR ticker IS NOT NULL),
  ADD CONSTRAINT book_ledger_fill_flow_ck
    CHECK (kind NOT IN ('buy', 'sell') OR (flow_try = 0 AND capital_delta = 0)),
  ADD CONSTRAINT book_ledger_correction_ck
    CHECK ((kind IN ('correction', 'reversal')) = (corrects_id IS NOT NULL));
CREATE UNIQUE INDEX book_ledger_one_start ON trading.book_ledger (book_no) WHERE kind = 'start';
CREATE UNIQUE INDEX book_ledger_one_reversal ON trading.book_ledger (corrects_id) WHERE kind = 'reversal';
CREATE INDEX book_ledger_corrects_idx ON trading.book_ledger (corrects_id) WHERE corrects_id IS NOT NULL;

ALTER TABLE trading.order_tickets
  ADD COLUMN commission_rate numeric(8,6) CHECK (commission_rate IS NULL OR commission_rate >= 0),
  ADD COLUMN commission_rate_own boolean NOT NULL DEFAULT false,
  ADD COLUMN corrected_at timestamptz;

GRANT SELECT, INSERT, UPDATE ON trading.book_epochs TO kaptan_app;
GRANT SELECT, INSERT ON trading.book_archive TO kaptan_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON trading.broker_fee TO kaptan_app;
"""

DOWN = """
ALTER TABLE trading.order_tickets DROP COLUMN IF EXISTS corrected_at, DROP COLUMN IF EXISTS commission_rate_own,
  DROP COLUMN IF EXISTS commission_rate;
DROP TABLE IF EXISTS trading.broker_fee;
DELETE FROM trading.book_ledger WHERE kind IN ('correction', 'reversal') OR book_no <> 1;
DROP INDEX IF EXISTS trading.book_ledger_corrects_idx;
DROP INDEX IF EXISTS trading.book_ledger_one_reversal;
DROP INDEX IF EXISTS trading.book_ledger_one_start;
ALTER TABLE trading.book_ledger
  DROP CONSTRAINT IF EXISTS book_ledger_correction_ck, DROP CONSTRAINT IF EXISTS book_ledger_fill_flow_ck,
  DROP CONSTRAINT IF EXISTS book_ledger_ticker_ck, DROP CONSTRAINT IF EXISTS book_ledger_kind_ck,
  DROP COLUMN IF EXISTS new_qty, DROP COLUMN IF EXISTS corrects_id, DROP COLUMN IF EXISTS book_no;
ALTER TABLE trading.book_ledger
  ADD CONSTRAINT book_ledger_kind_check CHECK (kind IN ('start', 'deposit', 'withdrawal', 'holding', 'buy', 'sell')),
  ADD CONSTRAINT book_ledger_ticker_shape CHECK ((kind IN ('holding', 'buy', 'sell')) = (ticker IS NOT NULL)),
  ADD CONSTRAINT book_ledger_fill_shape CHECK (kind NOT IN ('buy', 'sell') OR (flow_try = 0 AND capital_delta = 0));
CREATE UNIQUE INDEX book_ledger_one_start ON trading.book_ledger (kind) WHERE kind = 'start';
DROP TABLE IF EXISTS trading.book_archive;
DROP TABLE IF EXISTS trading.book_epochs;
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
