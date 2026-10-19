"""Reference data and point-in-time data jobs (M3 package A4).

Revision ID: 0016
Revises: 0013 (the head when this landed; numbers are package ids, not order)
Create Date: 2026-10-20

07 §9 names, with these deviations on purpose:
- core.issuers keeps its M1 shape (the agents read it, the demo seed inserts it positionally) and gets
  the snapshot columns of the universe job (`origin` 'demo' | 'kap'; the job never touches demo rows).
- core.issuer_profiles: sector / market / name per ticker from the slow sources (İş Yatırım's list,
  config overrides); it survives /demo/reset, which truncates core.issuers.
- core.market_changes: BIST "Pazar Değişikliği" disclosures (e.g. "Payların Yakın İzleme Pazarına
  Alınması") as point-in-time market membership for U1.
- core.universe_daily: `reasons` (the failed U-rule codes) and `checks` (each rule's inputs) instead of
  a single boolean, plus the inputs the rules used.
- core.ticker_history: PK (old_ticker, new_ticker) and a nullable `changed_on` (a rename whose first
  trading day is not verified yet is still a mapping); `core.ticker_codes(code)` = every code of the
  chain, so price reads join a renamed company's history (İş Yatırım/Yahoo serve it under the new code).
- core.restricted_securities stays the *active* list the agents read (R04/R13); tedbir_sync adds and
  prunes its own rows (`id` 'ts:…') and keeps every parsed measure in core.restriction_events (U7).
- core.fundamentals_pit has no FK to core.disclosures (the demo reset truncates it, CASCADE would
  empty this table); `source_disclosure` is the matching KAP "Finansal Rapor" index.
- core.events / core.event_returns as 07 §9 (+ `alpha`, `n_obs` of the fitted model);
  core.event_returns_dev hides the holdout (event_time ≥ 2025-01-01 Istanbul, 07 P7) and is the only
  one the `dev_ro` role may read.
- core.prices_intraday (+ `fetched_at`), ops.dq_results as 07 §9.
"""

from __future__ import annotations

from alembic import op

revision = "0016"
down_revision = "0013"
branch_labels = None
depends_on = None

KINDS = (
    "'spk_tedbir', 'vbts_brut_takas', 'vbts_aciga_satis', 'vbts_kredili_islem', 'vbts_tek_fiyat', "
    "'trading_halt', 'team_insider', 'other'"
)
MARKETS = "'yildiz', 'ana', 'alt', 'yip', 'gip', 'nitelikli', 'poip'"

UP = f"""
ALTER TABLE core.issuers
  ADD COLUMN origin              text NOT NULL DEFAULT 'demo' CHECK (origin IN ('demo', 'kap')),
  ADD COLUMN company_id          bigint,
  ADD COLUMN market              text,
  ADD COLUMN paid_in_capital_try numeric(24,2),
  ADD COLUMN mcap_try            numeric(24,2),
  ADD COLUMN adv20_median_try    numeric(24,2),
  ADD COLUMN history_sessions    int,
  ADD COLUMN tick_size           numeric(10,4),
  ADD COLUMN universe_reasons    text[] NOT NULL DEFAULT '{{}}',
  ADD COLUMN snapshot_d          date,
  ADD COLUMN updated_at          timestamptz;

CREATE TABLE core.issuer_profiles (
  ticker     text PRIMARY KEY CHECK (ticker ~ '^[A-Z0-9]{{3,8}}$'),
  name       text,
  sector     text,
  market     text CHECK (market IS NULL OR market IN ({MARKETS})),
  source     text NOT NULL CHECK (source IN ('isyatirim', 'config', 'kap', 'manual')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.market_changes (
  ticker            text NOT NULL,
  market            text NOT NULL CHECK (market IN ({MARKETS})),
  available_at      timestamptz NOT NULL,
  source_disclosure bigint NOT NULL,
  summary           text,
  PRIMARY KEY (ticker, source_disclosure)
);
CREATE INDEX market_changes_ticker_idx ON core.market_changes (ticker, available_at DESC);

CREATE TABLE core.universe_daily (
  d                date NOT NULL,
  ticker           text NOT NULL,
  is_eligible      boolean NOT NULL,
  reasons          text[] NOT NULL DEFAULT '{{}}',
  checks           jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  price_try        numeric(18,6),
  adv20_try        numeric(24,2),
  free_float_pct   numeric(7,4),
  mcap_try         numeric(24,2),
  ff_mcap_try      numeric(24,2),
  history_sessions int,
  tick_size        numeric(10,4),
  market           text,
  rule_version     text NOT NULL,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (d, ticker)
);
CREATE INDEX universe_daily_eligible_idx ON core.universe_daily (d) WHERE is_eligible;

CREATE TABLE core.ticker_history (
  old_ticker        text NOT NULL CHECK (old_ticker ~ '^[A-Z0-9]{{3,8}}$'),
  new_ticker        text NOT NULL CHECK (new_ticker ~ '^[A-Z0-9]{{3,8}}$'),
  company_id        bigint,
  changed_on        date,
  source            text NOT NULL CHECK (source IN ('kap', 'isyatirim', 'manual')),
  source_disclosure bigint,
  note              text,
  PRIMARY KEY (old_ticker, new_ticker),
  CHECK (old_ticker <> new_ticker)
);
CREATE INDEX ticker_history_new_idx ON core.ticker_history (new_ticker);

-- Every code of a rename chain (KOZAL ↔ TRALT), the code itself first among equals; {{code}} when none.
CREATE FUNCTION core.ticker_codes(code text) RETURNS text[]
LANGUAGE sql STABLE PARALLEL SAFE AS $fn$
  WITH RECURSIVE chain(t) AS (
    SELECT code
    UNION
    SELECT CASE WHEN h.old_ticker = c.t THEN h.new_ticker ELSE h.old_ticker END
      FROM core.ticker_history h JOIN chain c ON c.t IN (h.old_ticker, h.new_ticker)
  )
  SELECT array_agg(t ORDER BY t <> code, t) FROM chain
$fn$;

INSERT INTO core.ticker_history (old_ticker, new_ticker, changed_on, source, note) VALUES
  ('KOZAL', 'TRALT', NULL, 'manual',
   'Koza Altın → Türk Altın İşletmeleri (07 §6 [V]); İş Yatırım and Yahoo serve the whole history as TRALT; '
   'the first TRALT session is not verified yet');

ALTER TABLE core.restricted_securities
  ADD COLUMN start_date        date,
  ADD COLUMN expires_at        timestamptz,
  ADD COLUMN available_at      timestamptz,
  ADD COLUMN source_disclosure bigint,
  ADD COLUMN detail            jsonb NOT NULL DEFAULT '{{}}'::jsonb;
CREATE INDEX restricted_expiry_idx ON core.restricted_securities (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE core.restriction_events (
  id                text PRIMARY KEY,
  ticker            text NOT NULL,
  kind              text NOT NULL CHECK (kind IN ({KINDS})),
  start_date        date NOT NULL,
  end_date          date,
  expires_at        timestamptz,
  available_at      timestamptz NOT NULL,
  source            text NOT NULL CHECK (source IN ('kap', 'spk_bulletin', 'manual')),
  source_disclosure bigint,
  source_ref        text,
  detail            jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  parsed_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX restriction_events_ticker_idx ON core.restriction_events (ticker, start_date);

CREATE TABLE core.fundamentals_pit (
  ticker             text NOT NULL,
  period_end         date NOT NULL,
  item               text NOT NULL CHECK (item IN ('revenue_ttm', 'revenue_annual', 'net_income_ttm',
                                                   'paid_in_capital', 'equity', 'shares_outstanding',
                                                   'revenue_q', 'operating_profit_q',
                                                   'net_monetary_position_gain_q', 'net_profit_parent_q',
                                                   'cfo_ttm')),
  value              numeric(24,2) NOT NULL,
  currency           text NOT NULL DEFAULT 'TRY',
  is_inflation_adj   boolean NOT NULL,
  source             text NOT NULL DEFAULT 'kap_fr' CHECK (source IN ('kap_fr', 'isyatirim')),
  source_disclosure  bigint,
  available_at       timestamptz NOT NULL,
  available_at_basis text NOT NULL CHECK (available_at_basis IN ('kap_fr_publish', 'period_end_plus_legal_deadline')),
  fetched_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, period_end, item, available_at),
  CHECK (available_at_basis <> 'kap_fr_publish' OR source_disclosure IS NOT NULL)
);
CREATE INDEX fundamentals_lookup_idx ON core.fundamentals_pit (ticker, item, available_at DESC);

CREATE TABLE core.events (
  event_id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_kind      text NOT NULL CHECK (source_kind IN ('kap', 'news', 'macro')),
  disclosure_index bigint REFERENCES core.disclosures(disclosure_index) ON DELETE CASCADE,
  ticker           text,
  event_code       text NOT NULL CHECK (event_code IN ('E1', 'E2', 'E3', 'E4', 'AVOID', 'OTHER')),
  subtype          text,
  direction        smallint CHECK (direction IN (-1, 0, 1)),
  materiality      numeric,
  confidence       numeric CHECK (confidence BETWEEN 0 AND 1),
  extracted        jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  classifier       text NOT NULL,
  is_correction_of bigint REFERENCES core.events(event_id),
  event_time       timestamptz NOT NULL,
  available_at     timestamptz NOT NULL,
  t0_session       date,
  UNIQUE (disclosure_index, classifier)
);
CREATE INDEX events_ticker_time ON core.events (ticker, event_time);
CREATE INDEX events_code_time   ON core.events (event_code, event_time);

CREATE TABLE core.event_returns (
  event_id     bigint NOT NULL REFERENCES core.events(event_id) ON DELETE CASCADE,
  horizon      int NOT NULL CHECK (horizon IN (1, 5, 20, 60)),
  model        text NOT NULL CHECK (model IN ('market_adj', 'market_model')),
  t0           date NOT NULL,
  t_end        date NOT NULL,
  raw_ret      numeric(12,8) NOT NULL,
  bench_ret    numeric(12,8) NOT NULL,
  car          numeric(12,8) NOT NULL,
  alpha        numeric(14,10),
  beta         numeric(8,4),
  n_obs        int,
  available_at timestamptz NOT NULL,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, horizon, model)
);
CREATE INDEX event_returns_avail ON core.event_returns (available_at);

CREATE VIEW core.event_returns_dev AS
SELECT r.* FROM core.event_returns r
JOIN core.events e USING (event_id)
WHERE e.event_time < timestamptz '2025-01-01 00:00:00+03';

CREATE TABLE core.prices_intraday (
  ticker     text NOT NULL CHECK (ticker ~ '^[A-Z0-9]{{3,8}}$'),
  ts         timestamptz NOT NULL,
  interval   text NOT NULL CHECK (interval IN ('1m', '5m', '15m', '1h')),
  open       numeric(18,6),
  high       numeric(18,6),
  low        numeric(18,6),
  close      numeric(18,6) NOT NULL CHECK (close > 0),
  volume     numeric(24,4),
  source     text NOT NULL CHECK (source IN ('borsapy', 'yfinance')),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, ts, interval, source)
);
CREATE INDEX prices_intraday_latest_idx ON core.prices_intraday (ticker, ts DESC);

CREATE TABLE ops.dq_results (
  check_code text NOT NULL,
  run_at     timestamptz NOT NULL DEFAULT now(),
  severity   text NOT NULL CHECK (severity IN ('info', 'warn', 'error')),
  passed     boolean NOT NULL,
  observed   jsonb NOT NULL,
  PRIMARY KEY (check_code, run_at)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON core.issuer_profiles, core.market_changes, core.universe_daily,
  core.ticker_history, core.restriction_events, core.fundamentals_pit, core.events, core.event_returns,
  core.prices_intraday, ops.dq_results TO kaptan_app;
GRANT SELECT ON core.event_returns_dev TO kaptan_app;
GRANT USAGE, SELECT ON SEQUENCE core.events_event_id_seq TO kaptan_app;
GRANT EXECUTE ON FUNCTION core.ticker_codes(text) TO kaptan_app;

-- 07 P7: development notebooks connect as dev_ro and see returns only through the holdout-hiding view.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dev_ro') THEN
    CREATE ROLE dev_ro NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA core TO dev_ro;
GRANT SELECT ON core.disclosures, core.prices_daily, core.prices_daily_adj, core.corporate_actions,
  core.market_calendar, core.events, core.universe_daily, core.fundamentals_pit, core.event_returns_dev
  TO dev_ro;
REVOKE ALL ON core.event_returns FROM dev_ro;
"""  # noqa: S608 - DDL; KINDS and MARKETS are module constants

DOWN = """
REVOKE ALL ON core.event_returns_dev, core.disclosures, core.prices_daily, core.prices_daily_adj,
  core.corporate_actions, core.market_calendar, core.events, core.universe_daily, core.fundamentals_pit
  FROM dev_ro;
REVOKE USAGE ON SCHEMA core FROM dev_ro;
DROP TABLE IF EXISTS ops.dq_results;
DROP TABLE IF EXISTS core.prices_intraday;
DROP VIEW IF EXISTS core.event_returns_dev;
DROP TABLE IF EXISTS core.event_returns;
DROP TABLE IF EXISTS core.events;
DROP TABLE IF EXISTS core.fundamentals_pit;
DROP TABLE IF EXISTS core.restriction_events;
ALTER TABLE core.restricted_securities
  DROP COLUMN IF EXISTS start_date, DROP COLUMN IF EXISTS expires_at, DROP COLUMN IF EXISTS available_at,
  DROP COLUMN IF EXISTS source_disclosure, DROP COLUMN IF EXISTS detail;
DROP FUNCTION IF EXISTS core.ticker_codes(text);
DROP TABLE IF EXISTS core.ticker_history;
DROP TABLE IF EXISTS core.universe_daily;
DROP TABLE IF EXISTS core.market_changes;
DROP TABLE IF EXISTS core.issuer_profiles;
ALTER TABLE core.issuers
  DROP COLUMN IF EXISTS origin, DROP COLUMN IF EXISTS company_id, DROP COLUMN IF EXISTS market,
  DROP COLUMN IF EXISTS paid_in_capital_try, DROP COLUMN IF EXISTS mcap_try, DROP COLUMN IF EXISTS adv20_median_try,
  DROP COLUMN IF EXISTS history_sessions, DROP COLUMN IF EXISTS tick_size, DROP COLUMN IF EXISTS universe_reasons,
  DROP COLUMN IF EXISTS snapshot_d, DROP COLUMN IF EXISTS updated_at;
"""


def upgrade() -> None:
    # exec_driver_sql: no SQLAlchemy bind-parameter parsing (regexes / casts contain ":word").
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
