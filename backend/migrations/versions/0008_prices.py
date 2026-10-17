"""Prices: daily bars (raw + adjusted), corporate actions, the BIST session calendar.

Revision ID: 0008
Revises: 0001
Create Date: 2026-10-17

Follows docs/proje/07-veri-hatti-ve-sema.md §6 and §9 (`core.prices_daily`, `core.corporate_actions`,
`core.market_calendar`, view `core.prices_daily_adj`). Deviations, on purpose:
- `prices_daily.open_source`: İş Yatırım has no open; it is Yahoo's split-adjusted open scaled to the
  raw level (`kaptan.prices.merge`), so the row says where its open came from;
- `corporate_actions.source_disclosure` has no FK to core.disclosures: the demo reset TRUNCATEs
  disclosures with CASCADE and must not wipe price history; `note` and `fetched_at` added;
- the adjusted view only adjusts raw rows (`price_basis = 'raw'`): Yahoo rows are already adjusted.
`market_calendar` is seeded 2018–2027 from `kaptan.prices.calendar` (checked against XU100 bars).
"""

from __future__ import annotations

from datetime import date, timedelta

from alembic import op

revision = "0008"
down_revision = "0001"
branch_labels = None
depends_on = None

TABLES = """
CREATE TABLE core.prices_daily (
  ticker              text NOT NULL CHECK (ticker ~ '^[A-Z0-9]{3,8}$'),
  d                   date NOT NULL,
  open                numeric(18,6) CHECK (open IS NULL OR open > 0),
  high                numeric(18,6),
  low                 numeric(18,6),
  close               numeric(18,6) NOT NULL CHECK (close > 0),
  volume              numeric(24,4) CHECK (volume IS NULL OR volume > 0),
  turnover_try        numeric(24,2),
  mcap_try            numeric(24,2),
  free_float_mcap_try numeric(24,2),
  capital_try         numeric(24,2),
  ref_adj_close       numeric(18,6),
  price_basis         text NOT NULL DEFAULT 'raw' CHECK (price_basis IN ('raw', 'adjusted')),
  source              text NOT NULL CHECK (source IN ('isyatirim', 'yfinance', 'borsapy')),
  open_source         text CHECK (open_source IN ('isyatirim', 'yfinance_scaled')),
  fetched_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, d, source),
  CHECK (high IS NULL OR low IS NULL OR high >= low),
  CHECK (price_basis = 'raw' OR source <> 'isyatirim')
);
COMMENT ON TABLE core.prices_daily IS
  'Daily bars. Raw levels (fills, R09 band) only from source=isyatirim AND price_basis=raw (P8).';
CREATE INDEX prices_daily_d_idx ON core.prices_daily (d);

CREATE TABLE core.corporate_actions (
  ticker             text NOT NULL CHECK (ticker ~ '^[A-Z0-9]{3,8}$'),
  ex_date            date NOT NULL,
  kind               text NOT NULL CHECK (kind IN ('bedelsiz', 'bedelli', 'temettu', 'split', 'other')),
  bonus_capital_pct  numeric(18,6),
  bonus_dividend_pct numeric(18,6),
  rights_pct         numeric(18,6),
  subscription_price numeric(18,6),
  cash_gross         numeric(18,6),
  cash_net           numeric(18,6),
  factor             numeric(18,12) NOT NULL CHECK (factor > 0 AND factor <= 1.5),
  announced_at       timestamptz,
  source_disclosure  bigint,
  source             text NOT NULL CHECK (source IN ('isyatirim', 'yfinance', 'borsapy', 'kap', 'manual')),
  note               text,
  fetched_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, ex_date, kind)
);
CREATE INDEX ca_ticker_ex_idx ON core.corporate_actions (ticker, ex_date);

CREATE TABLE core.market_calendar (
  d              date PRIMARY KEY,
  is_trading_day boolean NOT NULL,
  is_half_day    boolean NOT NULL DEFAULT false,
  note           text
);

-- Adjusted view: factor of day d = product of the factors of all ex-dates AFTER d (07 §6).
CREATE VIEW core.prices_daily_adj AS
SELECT p.ticker, p.d, p.source,
       p.close * f.adj AS adj_close,
       p.open  * f.adj AS adj_open,
       p.high  * f.adj AS adj_high,
       p.low   * f.adj AS adj_low,
       p.volume / NULLIF(f.adj, 0) AS adj_volume,
       p.close AS raw_close, p.open AS raw_open, f.adj AS adj_factor
FROM core.prices_daily p
CROSS JOIN LATERAL (
  SELECT COALESCE(exp(sum(ln(ca.factor))), 1.0) AS adj
  FROM core.corporate_actions ca
  WHERE ca.ticker = p.ticker AND ca.ex_date > p.d
) f
WHERE p.price_basis = 'raw';

GRANT SELECT, INSERT, UPDATE, DELETE ON core.prices_daily, core.corporate_actions, core.market_calendar TO kaptan_app;
GRANT SELECT ON core.prices_daily_adj TO kaptan_app;
"""

DOWN = """
DROP VIEW IF EXISTS core.prices_daily_adj;
DROP TABLE IF EXISTS core.market_calendar;
DROP TABLE IF EXISTS core.corporate_actions;
DROP TABLE IF EXISTS core.prices_daily;
"""


def _calendar_sql() -> str:
    from kaptan.prices import calendar as cal

    rows = []
    d = date(cal.FIRST_YEAR, 1, 1)
    while d.year <= cal.LAST_YEAR:
        trading = cal.is_trading_day(d)
        note = (
            "weekend"
            if d.weekday() >= 5
            else ("holiday" if not trading else ("half day" if cal.is_half_day(d) else None))
        )
        note_sql = f"'{note}'" if note else "NULL"
        rows.append(f"('{d.isoformat()}', {str(trading).lower()}, {str(cal.is_half_day(d)).lower()}, {note_sql})")
        d += timedelta(days=1)
    return "INSERT INTO core.market_calendar (d, is_trading_day, is_half_day, note) VALUES\n" + ",\n".join(rows) + ";"


def _sql(block: str) -> None:
    op.get_bind().exec_driver_sql(block)


def upgrade() -> None:
    _sql(TABLES)
    _sql(_calendar_sql())


def downgrade() -> None:
    _sql(DOWN)
