"""TCMB exchange rates (M3, FR-41): `core.fx_rates`, the rate E3 converts a USD/EUR amount with.

Revision ID: 0013
Revises: 0015 (the head when this landed; numbers are package ids, not order)
Create Date: 2026-10-20

One row per bulletin day and currency: ForexBuying per unit (06 §3.3 "TCMB döviz alış"), and the
moment it became public (`available_at`, 15:30 Istanbul on the bulletin date, `kaptan.market.fx`).
Reads take the newest row with `available_at < as_of` (no look-ahead). 07 §9 puts FX into
`core.macro_series`; a typed table is used instead so the merge node reads one indexed row.
No foreign keys: /demo/reset truncates disclosures and must not touch market data.
"""

from __future__ import annotations

from alembic import op

revision = "0013"
down_revision = "0015"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE core.fx_rates (
  d            date NOT NULL,
  currency     text NOT NULL CHECK (currency ~ '^[A-Z]{3}$' AND currency <> 'TRY'),
  rate         numeric(20,8) NOT NULL CHECK (rate > 0),
  available_at timestamptz NOT NULL,
  source       text NOT NULL DEFAULT 'tcmb' CHECK (source IN ('tcmb', 'manual')),
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (d, currency)
);
COMMENT ON TABLE core.fx_rates IS
  'TCMB ForexBuying (TRY per unit). Use the newest row with available_at < as_of (FR-41, P1).';
CREATE INDEX fx_rates_currency_available_idx ON core.fx_rates (currency, available_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON core.fx_rates TO kaptan_app;
"""

DOWN = "DROP TABLE IF EXISTS core.fx_rates;"


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
