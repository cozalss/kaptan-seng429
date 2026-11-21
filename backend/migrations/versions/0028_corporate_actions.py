"""Dividends, bonus issues and rights issues on the person's holdings (agent CORP).

Revision ID: 0028_corporate_actions
Revises: 0027_book_fixes
Create Date: 2026-11-21

- `trading.corporate_book`: what the person recorded about a company action on a share they hold, one row per
  record, append-only. A correction is a new row with `corrects_id` set; it reverses the ledger effect of the row
  it corrects. `kind`: `dividend` (cash received), `bonus` (bedelsiz: more shares, same total cost, no cash),
  `rights` (bedelli: more shares bought at the subscription price, cash out). `book_no` is the book it belongs to (as on the ledger). `detail` holds the per-position
  before/after of a bonus or rights record, so a correction puts every position back exactly.
- `trading.corporate_notices`: what the person did with a KAP notice that told them about an action
  (`recorded` or `dismissed`); the notices themselves are read from `core.disclosures`, nothing is copied.
- `trading.book_ledger` accepts three more kinds, `dividend`, `bonus` and `rights`. They are shaped like `buy` and
  `sell`: they carry a ticker and are never an outside flow (`flow_try = 0`, `capital_delta = 0`), so none of them is
  a deposit or a withdrawal. The two constraints that list the kinds are rewritten in place from their current text
  (whatever kinds an earlier step added stay), so this step does not depend on what the others wrote.
"""

from __future__ import annotations

from alembic import op

revision = "0028_corporate_actions"
down_revision = "0027_book_fixes"
branch_labels = None
depends_on = None

NEW_KINDS = "'dividend'::text, 'bonus'::text, 'rights'::text"
QUOTED = NEW_KINDS.replace("'", "''")  # inside an SQL string literal

UP = f"""
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'trading.book_ledger'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%''sell''::text%' AND pg_get_constraintdef(oid) NOT LIKE '%''dividend''%'
  LOOP
    EXECUTE format('ALTER TABLE trading.book_ledger DROP CONSTRAINT %I', c.conname);
    EXECUTE format('ALTER TABLE trading.book_ledger ADD CONSTRAINT %I %s', c.conname,
                   replace(c.def, '''sell''::text', '''sell''::text, {QUOTED}'));
  END LOOP;
END $$;

CREATE TABLE trading.corporate_book (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('dividend', 'bonus', 'rights')),
  ticker        text NOT NULL,
  effective_at  timestamptz NOT NULL,       -- dividend: the day the money arrived; bonus / rights: the first price after it
  recorded_at   timestamptz NOT NULL,
  net_try       numeric(18,2),              -- dividend: cash received; rights: cash paid
  gross_try     numeric(18,2),              -- dividend: before withholding, when the person knows it
  qty_before    int,
  qty_added     int,
  price         numeric(18,6),              -- rights: the subscription price per share
  detail        jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  ledger_id     bigint NOT NULL,
  corrects_id   bigint REFERENCES trading.corporate_book(id),
  notice_index  bigint,
  note          text NOT NULL DEFAULT '',
  book_no       int NOT NULL DEFAULT 1 REFERENCES trading.book_epochs(no)   -- a restarted book starts without them
);
CREATE UNIQUE INDEX corporate_book_one_correction ON trading.corporate_book (corrects_id) WHERE corrects_id IS NOT NULL;
CREATE INDEX corporate_book_ticker_idx ON trading.corporate_book (ticker, effective_at);

CREATE TABLE trading.corporate_notices (
  disclosure_index bigint PRIMARY KEY,
  status           text NOT NULL CHECK (status IN ('recorded', 'dismissed')),
  decided_at       timestamptz NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON trading.corporate_book, trading.corporate_notices TO kaptan_app;
"""

DOWN = f"""
DROP TABLE IF EXISTS trading.corporate_notices;
DROP TABLE IF EXISTS trading.corporate_book;
DELETE FROM trading.book_ledger WHERE kind IN ('dividend', 'bonus', 'rights');
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'trading.book_ledger'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%''dividend''%'
  LOOP
    EXECUTE format('ALTER TABLE trading.book_ledger DROP CONSTRAINT %I', c.conname);
    EXECUTE format('ALTER TABLE trading.book_ledger ADD CONSTRAINT %I %s', c.conname,
                   replace(c.def, ', {QUOTED}', ''));
  END LOOP;
END $$;
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP.replace("%", "%%"))


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN.replace("%", "%%"))
