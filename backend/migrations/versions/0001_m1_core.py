"""M1 core schema: the tables the whole API contract (kaptan-panel/API.md) needs.

Revision ID: 0001
Revises:
Create Date: 2026-10-17

Names follow docs/proje/07-veri-hatti-ve-sema.md §9 where it defines them (schemas auth/core/trading/
audit/ops, disclosures, agent_runs, trade_proposals, approvals, orders, fills, positions, pnl_daily,
limit_versions/limits, audit.audit_log, audit.anchors). M1 deviations, on purpose:
- ids are the panel's text ids ("prop-day-e1-krgcl", "uye-3", "run-…") instead of uuids;
- an agent run keeps its "Neden bu işlem?" document in agent_runs.explain (JSONB) — the panel only
  reads that document in M1; per-node tables (agent_outputs, decisions, risk_checks) come with M2;
- the audit hash is computed by the app (kaptan.audit.writer, the panel's exact canonical JSON),
  not by a trigger; triggers only forbid UPDATE/DELETE/TRUNCATE, and the app role gets INSERT/SELECT.
"""

from __future__ import annotations

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

ROLES_AND_SCHEMAS = """
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kaptan_app') THEN
    CREATE ROLE kaptan_app NOLOGIN;
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS trading;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS ops;
"""

AUTH = """
CREATE TABLE auth.users (
  uid          text PRIMARY KEY,
  display_name text NOT NULL,
  role         text NOT NULL CHECK (role IN ('analyst', 'risk_officer', 'admin', 'auditor')),
  duty_tr      text NOT NULL,
  ord          int  NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Refresh-token families (09 §6): only the sha256 of the opaque token is stored.
CREATE TABLE auth.refresh_tokens (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  family_id  text NOT NULL,
  uid        text NOT NULL REFERENCES auth.users(uid),
  role       text NOT NULL CHECK (role IN ('analyst', 'risk_officer', 'admin', 'auditor')),
  issued_at  timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  revoked_at timestamptz
);
CREATE INDEX refresh_tokens_family_idx ON auth.refresh_tokens (family_id);
"""

CORE = """
CREATE TABLE core.issuers (
  ticker      text PRIMARY KEY CHECK (ticker ~ '^[A-Z0-9]{3,6}$'),
  name        text NOT NULL,
  sector      text NOT NULL,
  group_name  text,
  free_float  double precision NOT NULL,
  adv20_try   double precision NOT NULL,
  price       double precision NOT NULL CHECK (price > 0),
  in_universe boolean NOT NULL
);

-- 07 §9 core.disclosures, plus the panel's list fields and the demo-day visibility columns:
-- visible = shown now; release_order = post-13:40 rows the live ticker releases one by one;
-- scenario = demo rows that appear only when injected (ingest_source 'demo').
CREATE TABLE core.disclosures (
  disclosure_index    bigint PRIMARY KEY,
  disclosure_oid      text UNIQUE NOT NULL,
  stock_codes         text[] NOT NULL DEFAULT '{}',
  related_stocks      text[] NOT NULL DEFAULT '{}',
  primary_ticker      text,
  company_name        text NOT NULL,
  disclosure_class    text NOT NULL CHECK (disclosure_class IN ('ODA', 'FR', 'DG', 'DKB', 'DUY')),
  disclosure_type     text NOT NULL,
  subject             text NOT NULL,
  summary             text NOT NULL,
  reason              text NOT NULL CHECK (reason IN ('NEW', 'UPD', 'CORR', 'CANC')),
  related_index       bigint,
  is_late             boolean NOT NULL DEFAULT false,
  attachment_count    int NOT NULL DEFAULT 0,
  has_multilang       boolean NOT NULL DEFAULT false,
  is_noise            boolean NOT NULL DEFAULT false,
  subject_route       text NOT NULL,
  subject_map_version text NOT NULL,
  published_at        timestamptz NOT NULL,
  first_seen_at       timestamptz NOT NULL,
  available_at        timestamptz NOT NULL,
  ingest_source       text NOT NULL CHECK (ingest_source IN ('live', 'backfill', 'reconcile', 'demo')),
  classification      jsonb,
  run_id              text,
  linked_news_count   int NOT NULL DEFAULT 0,
  note_count          int NOT NULL DEFAULT 0,
  day_slot            int,
  visible             boolean NOT NULL DEFAULT true,
  release_order       int UNIQUE,
  scenario            text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (available_at >= published_at)
);
CREATE INDEX disclosures_published_idx ON core.disclosures (published_at DESC);
CREATE INDEX disclosures_visible_idx   ON core.disclosures (visible, published_at DESC);

CREATE TABLE core.disclosure_texts (
  disclosure_index bigint NOT NULL REFERENCES core.disclosures(disclosure_index) ON DELETE CASCADE,
  lang             text NOT NULL CHECK (lang IN ('tr', 'en')),
  body             text NOT NULL,
  PRIMARY KEY (disclosure_index, lang)
);

-- R04 / R13 restricted list (06), as the panel shows it.
CREATE TABLE core.restricted_securities (
  id         text PRIMARY KEY,
  ticker     text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('spk_tedbir', 'vbts_brut_takas', 'vbts_aciga_satis', 'vbts_kredili_islem',
                                           'vbts_tek_fiyat', 'trading_halt', 'team_insider', 'other')),
  source_ref text,
  added_at   timestamptz NOT NULL,
  added_by   text NOT NULL
);
CREATE INDEX restricted_ticker_idx ON core.restricted_securities (ticker);

CREATE TABLE core.watchlist (
  ticker text PRIMARY KEY,
  ord    int NOT NULL
);

-- "Today" LLM usage for DayCounters (the rest of the counters is derived from the tables).
CREATE TABLE core.day_counters (
  d          date PRIMARY KEY,
  llm_calls  int    NOT NULL DEFAULT 0 CHECK (llm_calls >= 0),
  llm_tokens bigint NOT NULL DEFAULT 0 CHECK (llm_tokens >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
"""

TRADING_RUNS = """
-- One graph run. `explain` is the full Explain document as the pipeline (or the fixture) produced it;
-- GET /runs/{id}/explain overlays the live parts (approval status, orders, fills, ticket, audit positions).
CREATE TABLE trading.agent_runs (
  run_id           text PRIMARY KEY,
  disclosure_index bigint NOT NULL REFERENCES core.disclosures(disclosure_index),
  ticker           text NOT NULL,
  company_name     text NOT NULL,
  event_type       text,
  kind             text NOT NULL CHECK (kind IN ('propose', 'no_trade', 'hold', 'quarantine', 'pregate_veto', 'archived')),
  status           text NOT NULL CHECK (status IN ('running', 'interrupted', 'completed', 'failed', 'hold_quota', 'skipped')),
  outcome          text CHECK (outcome IN ('PROPOSE', 'NO_TRADE', 'HOLD', 'QUARANTINED', 'PREGATE_VETO')),
  mode             text NOT NULL CHECK (mode IN ('paper', 'personal', 'live', 'backtest', 'replay', 'demo')),
  run_set          text NOT NULL CHECK (run_set IN ('day', 'history', 'demo', 'live')),
  scenario         text,
  visible          boolean NOT NULL DEFAULT true,
  strategy_version text NOT NULL,
  is_fixture       boolean NOT NULL DEFAULT false,
  started_at       timestamptz NOT NULL,
  finished_at      timestamptz,
  llm_calls        int NOT NULL DEFAULT 0,
  tokens_in        int NOT NULL DEFAULT 0,
  tokens_out       int NOT NULL DEFAULT 0,
  latency_ms       int NOT NULL DEFAULT 0,
  injected_at      timestamptz,
  spec             jsonb,
  explain          jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_runs_started_idx ON trading.agent_runs (started_at DESC);
CREATE INDEX agent_runs_disclosure_idx ON trading.agent_runs (disclosure_index);

CREATE TABLE trading.trade_proposals (
  proposal_id text PRIMARY KEY,
  run_id      text UNIQUE NOT NULL REFERENCES trading.agent_runs(run_id),
  ticker      text NOT NULL,
  doc         jsonb NOT NULL,              -- TradeProposal
  created_at  timestamptz NOT NULL
);

-- The approval card: `card` is the immutable part (ApprovalCard as requested); the decision columns
-- are the live part. Effective status (cancelled by the kill switch, expired at 09:50) is derived at read.
CREATE TABLE trading.approvals (
  proposal_id           text PRIMARY KEY REFERENCES trading.trade_proposals(proposal_id),
  run_id                text NOT NULL REFERENCES trading.agent_runs(run_id),
  card                  jsonb NOT NULL,
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'claimed', 'approved', 'rejected', 'expired', 'cancelled')),
  decided_by            text REFERENCES auth.users(uid),
  decided_role          text CHECK (decided_role IN ('analyst', 'risk_officer', 'admin', 'auditor')),
  decided_at            timestamptz,
  decision_comment      text,
  approved_notional_try double precision CHECK (approved_notional_try IS NULL OR approved_notional_try > 0),
  created_at            timestamptz NOT NULL,
  expires_at            timestamptz NOT NULL,
  row_version           int NOT NULL DEFAULT 0,
  CHECK (status IN ('pending', 'expired', 'cancelled') OR decided_by IS NOT NULL)
);
CREATE INDEX approvals_status_idx ON trading.approvals (status, created_at DESC);

-- Every signature on a proposal (append-only history; approvals holds the current state).
CREATE TABLE trading.approval_decisions (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proposal_id           text NOT NULL REFERENCES trading.trade_proposals(proposal_id),
  uid                   text NOT NULL REFERENCES auth.users(uid),
  name                  text NOT NULL,
  role                  text NOT NULL,
  decision              text NOT NULL CHECK (decision IN ('approve', 'reject')),
  approved_notional_try double precision,
  comment               text,
  decided_at            timestamptz NOT NULL
);

CREATE SEQUENCE trading.proposal_note_seq;
CREATE TABLE trading.proposal_notes (
  id          text PRIMARY KEY DEFAULT ('not-' || nextval('trading.proposal_note_seq')),
  proposal_id text NOT NULL REFERENCES trading.trade_proposals(proposal_id),
  uid         text NOT NULL REFERENCES auth.users(uid),
  name        text NOT NULL,
  role        text NOT NULL CHECK (role IN ('analyst', 'risk_officer', 'admin', 'auditor')),
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at  timestamptz NOT NULL
);
CREATE INDEX proposal_notes_proposal_idx ON trading.proposal_notes (proposal_id, created_at);
"""

TRADING_EXECUTION = """
CREATE TABLE trading.orders (
  id              text PRIMARY KEY,
  client_order_id text UNIQUE NOT NULL,
  proposal_id     text NOT NULL REFERENCES trading.trade_proposals(proposal_id),
  run_id          text NOT NULL REFERENCES trading.agent_runs(run_id),
  ticker          text NOT NULL,
  company_name    text NOT NULL,
  side            text NOT NULL CHECK (side IN ('buy', 'sell')),
  order_type      text NOT NULL CHECK (order_type IN ('market', 'limit')),
  tif             text NOT NULL CHECK (tif IN ('day', 'opg')),
  qty             int  NOT NULL CHECK (qty > 0),
  limit_price     double precision CHECK (limit_price IS NULL OR limit_price > 0),
  status          text NOT NULL CHECK (status IN ('pending_open', 'accepted', 'awaiting_manual_entry',
                                                  'partially_filled', 'filled', 'canceled', 'rejected')),
  broker          text NOT NULL CHECK (broker IN ('simbist', 'order_ticket')),
  cancel_reason   text CHECK (cancel_reason IN ('limit_up_open', 'kill_switch', 'day_end', 'ticket_unfilled',
                                                'ticket_canceled', 'ticket_expired')),
  is_fixture      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_run_idx ON trading.orders (run_id);
CREATE INDEX orders_status_idx ON trading.orders (status, created_at DESC);

CREATE TABLE trading.fills (
  id           text PRIMARY KEY,
  order_id     text NOT NULL REFERENCES trading.orders(id),
  qty          int  NOT NULL CHECK (qty > 0),
  price        double precision NOT NULL CHECK (price > 0),
  commission   double precision NOT NULL DEFAULT 0 CHECK (commission >= 0),
  bsmv         double precision NOT NULL DEFAULT 0 CHECK (bsmv >= 0),
  slippage_bps double precision NOT NULL DEFAULT 0,
  filled_at    timestamptz NOT NULL,
  source       text NOT NULL CHECK (source IN ('simbist', 'alpaca', 'manual'))
);
CREATE INDEX fills_order_idx ON trading.fills (order_id);

-- Personal-mode order tickets (12 §2): `doc` = OrderTicket without `entry`; the entry columns are the mark.
CREATE TABLE trading.order_tickets (
  ticket_no    text PRIMARY KEY,
  order_id     text UNIQUE NOT NULL,
  proposal_id  text NOT NULL REFERENCES trading.trade_proposals(proposal_id),
  run_id       text NOT NULL REFERENCES trading.agent_runs(run_id),
  doc          jsonb NOT NULL,
  entry_status text NOT NULL DEFAULT 'awaiting'
               CHECK (entry_status IN ('awaiting', 'entered', 'unfilled', 'canceled', 'expired')),
  filled_qty   int CHECK (filled_qty IS NULL OR filled_qty > 0),
  avg_price    double precision CHECK (avg_price IS NULL OR avg_price > 0),
  filled_at    timestamptz,
  note         text,
  marked_at    timestamptz,
  created_at   timestamptz NOT NULL,
  valid_until  timestamptz NOT NULL
);

CREATE TABLE trading.positions (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  book              text NOT NULL CHECK (book IN ('paper', 'personal')),
  ticker            text NOT NULL,
  company_name      text NOT NULL,
  qty               int  NOT NULL CHECK (qty > 0),                 -- no short selling
  avg_cost          double precision NOT NULL CHECK (avg_cost > 0),
  last_price        double precision NOT NULL CHECK (last_price > 0),
  opened_at         timestamptz NOT NULL,
  planned_exit_date date NOT NULL,
  source_proposal   text NOT NULL REFERENCES trading.trade_proposals(proposal_id),
  run_id            text NOT NULL REFERENCES trading.agent_runs(run_id),
  event_type        text NOT NULL CHECK (event_type IN ('E1', 'E2', 'E3', 'E4')),
  strategy_version  text NOT NULL,
  realized_pnl      double precision NOT NULL DEFAULT 0,
  UNIQUE (book, source_proposal)
);

CREATE TABLE trading.pnl_daily (
  strategy     text NOT NULL,
  d            date NOT NULL,
  ord          int  NOT NULL,
  equity       double precision NOT NULL,
  daily_return double precision NOT NULL,
  peak_equity  double precision NOT NULL,
  drawdown     double precision NOT NULL CHECK (drawdown <= 0),
  n_positions  int NOT NULL CHECK (n_positions >= 0),
  n_trades     int NOT NULL CHECK (n_trades >= 0),
  PRIMARY KEY (strategy, d)
);
CREATE INDEX pnl_daily_ord_idx ON trading.pnl_daily (ord);
"""

TRADING_RISK = """
-- Kill switch, daily halt and the two-person restart (1/2 started by; null when none).
CREATE TABLE trading.risk_state (
  id                        smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  kill_switch               text NOT NULL DEFAULT 'off' CHECK (kill_switch IN ('off', 'on')),
  kill_reason               text,
  kill_at                   timestamptz,
  kill_by                   text,
  halted_today              boolean NOT NULL DEFAULT false,
  daily_pnl_pct             double precision NOT NULL DEFAULT 0,
  drawdown_pct              double precision NOT NULL DEFAULT 0 CHECK (drawdown_pct <= 0),
  regime                    text NOT NULL DEFAULT 'normal' CHECK (regime IN ('normal', 'crisis')),
  positions_managed_by_exit boolean NOT NULL DEFAULT false,
  reset_started             jsonb,                         -- Signature of the Yönetici's start (1/2)
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CHECK (kill_switch = 'on' OR reset_started IS NULL)
);

CREATE TABLE trading.quota_usage (
  provider      text PRIMARY KEY,
  ord           int NOT NULL,
  used          int NOT NULL CHECK (used >= 0),
  per_injection int NOT NULL DEFAULT 0,
  limit_n       int NOT NULL CHECK (limit_n > 0)
);

CREATE TABLE trading.live_arm (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config_live boolean NOT NULL DEFAULT false,
  env_enabled boolean NOT NULL DEFAULT false,
  ui_key      boolean NOT NULL DEFAULT false,
  armed       boolean NOT NULL DEFAULT false,
  expires_at  timestamptz
);

-- Versioned limits, two signatures (proposed_by / decided_by are Signature documents).
CREATE TABLE trading.limit_versions (
  version        int PRIMARY KEY CHECK (version > 0),
  status         text NOT NULL CHECK (status IN ('proposed', 'active', 'superseded', 'rejected')),
  reason         text NOT NULL CHECK (char_length(reason) > 0),
  created_at     timestamptz NOT NULL,
  effective_from timestamptz,
  proposed_by    jsonb NOT NULL,
  decided_by     jsonb,
  CHECK (decided_by IS NULL OR decided_by->>'uid' <> proposed_by->>'uid'),
  CHECK (status NOT IN ('active', 'superseded') OR decided_by IS NOT NULL)
);
CREATE UNIQUE INDEX limit_versions_one_active ON trading.limit_versions ((true)) WHERE status = 'active';
CREATE UNIQUE INDEX limit_versions_one_pending ON trading.limit_versions ((true)) WHERE status = 'proposed';

CREATE TABLE trading.limits (
  version int NOT NULL REFERENCES trading.limit_versions(version),
  key     text NOT NULL,
  value   double precision NOT NULL,
  ord     int NOT NULL,
  PRIMARY KEY (version, key)
);
"""

AUDIT = """
-- Append-only, hash-chained (07 §9, 09 §7). seq = chain_pos (the panel's AuditEntry has both).
-- hash = sha256(prev_hash || canonical) computed by kaptan.audit.writer; genesis prev_hash = '00'.
CREATE TABLE audit.audit_log (
  seq              bigint PRIMARY KEY,
  chain_pos        bigint UNIQUE NOT NULL CHECK (chain_pos > 0),
  occurred_at      timestamptz NOT NULL,
  actor            text NOT NULL CHECK (actor ~ '^(user|agent|system):[^[:space:]]+$'),
  action           text NOT NULL CHECK (action ~ '^[a-z_]+\\.[a-z_.]+$'),
  entity_type      text NOT NULL,
  entity_id        text NOT NULL,
  run_id           text,
  strategy_version text,
  payload          jsonb NOT NULL,
  prev_hash        text NOT NULL CHECK (prev_hash ~ '^([0-9a-f]{2}|[0-9a-f]{64})$'),
  hash             text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  CHECK (seq = chain_pos)
);
CREATE INDEX audit_entity_idx ON audit.audit_log (entity_type, entity_id);
CREATE INDEX audit_run_idx    ON audit.audit_log (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX audit_time_idx   ON audit.audit_log (occurred_at);

CREATE FUNCTION audit.forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_log yalnızca eklenebilir'; END $$;
CREATE TRIGGER trg_audit_immutable BEFORE UPDATE OR DELETE ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION audit.forbid_mutation();
CREATE TRIGGER trg_audit_no_truncate BEFORE TRUNCATE ON audit.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit.forbid_mutation();

CREATE TABLE audit.anchors (                          -- nightly external anchor
  anchored_at timestamptz PRIMARY KEY,
  chain_pos   bigint NOT NULL,
  hash        text NOT NULL,
  target      text NOT NULL
);
"""

OPS = """
-- Demo clock and switches (DEMO_MODE). started_at = the real moment the demo clock read 13:40.
CREATE TABLE ops.demo_state (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  started_at  timestamptz NOT NULL,
  tamper_on   boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ops.demo_injections (
  scenario    text PRIMARY KEY CHECK (scenario IN ('e3_contract', 'redteam_injection', 'restricted_r04', 'loss_simulation')),
  run_id      text,
  injected_at timestamptz NOT NULL,             -- demo clock
  real_at     timestamptz NOT NULL DEFAULT now() -- wall clock (drives the 7.5 s run animation)
);
"""

GRANTS = """
GRANT USAGE ON SCHEMA auth, core, trading, audit, ops TO kaptan_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth, core, trading, ops TO kaptan_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth, core, trading, ops TO kaptan_app;
-- Tables later migrations create (as the owner) get the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA auth, core, trading, ops
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kaptan_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth, core, trading, ops
  GRANT USAGE, SELECT ON SEQUENCES TO kaptan_app;
-- The ledger: INSERT and SELECT only (no UPDATE/DELETE/TRUNCATE) for the app.
REVOKE ALL ON audit.audit_log, audit.anchors FROM PUBLIC;
GRANT SELECT, INSERT ON audit.audit_log, audit.anchors TO kaptan_app;
"""

DOWN = """
DROP SCHEMA IF EXISTS ops CASCADE;
DROP SCHEMA IF EXISTS audit CASCADE;
DROP SCHEMA IF EXISTS trading CASCADE;
DROP SCHEMA IF EXISTS core CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;
"""


def _sql(block: str) -> None:
    # exec_driver_sql: no SQLAlchemy bind-parameter parsing (regexes contain ":word").
    op.get_bind().exec_driver_sql(block)


def upgrade() -> None:
    for block in (ROLES_AND_SCHEMAS, AUTH, CORE, TRADING_RUNS, TRADING_EXECUTION, TRADING_RISK, AUDIT, OPS, GRANTS):
        _sql(block)


def downgrade() -> None:
    _sql(DOWN)
