"""Learning: versioned rule thresholds, decision predictions, calibration and the weekly report (agent LEARN).

Revision ID: 0041_learning
Revises: 0040_reverse_split_bound
Create Date: 2026-11-27

All additive; the person's real database runs this. Nothing here reads or stores the sealed holdout
(2025-01-01 → 2026-10-31): `kaptan.learn` builds its pool from 2022–2024 and from live events after it.
- `learn.rule_versions`: one row per rules version the learning loop made. `params` holds only the thresholds that
  differ from the canonical `RuleParams` (an empty table = the canonical rules, `rules_hash` unchanged). Like
  `trading.limit_versions`: at most one `active` row; a change or a "Geri al" is a new row and the old one becomes
  `superseded`; nothing is edited in place except that status. `proposed` rows (self-learning off) never apply.
- `learn.predictions`: one row per live decision the sizer priced: the predicted edge (before any correction), the
  cost, the correction used and, once its window closed, the realised CAR (`core.event_returns`).
- `learn.calibration`: per event type, the latest slope / bias of realised on predicted and the bounded factor.
- `learn.reports`: one row per weekly pass (its document is what GET /me/learning shows).
- `learn.settings` (one row): "Kendi kendine öğrenme", on by default.
"""

from __future__ import annotations

from alembic import op

revision = "0041_learning"
down_revision = "0040_reverse_split_bound"
branch_labels = None
depends_on = None

UP = """
CREATE SCHEMA IF NOT EXISTS learn;
GRANT USAGE ON SCHEMA learn TO kaptan_app;

CREATE TABLE IF NOT EXISTS learn.rule_versions (
  version     int PRIMARY KEY CHECK (version >= 1),
  params      jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules_hash  text NOT NULL,
  status      text NOT NULL CHECK (status IN ('active', 'superseded', 'proposed', 'rejected')),
  origin      text NOT NULL CHECK (origin IN ('learn', 'revert')),
  rule        text NOT NULL,
  from_value  double precision NOT NULL,
  to_value    double precision NOT NULL,
  evidence    jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason_tr   text NOT NULL,
  reverts     int REFERENCES learn.rule_versions(version),
  created_at  timestamptz NOT NULL,
  created_by  text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS rule_versions_one_active ON learn.rule_versions ((true)) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS rule_versions_rule_idx ON learn.rule_versions (rule, created_at DESC);

CREATE TABLE IF NOT EXISTS learn.predictions (
  run_id            text PRIMARY KEY,
  disclosure_index  bigint NOT NULL,
  ticker            text NOT NULL,
  event_type        text NOT NULL CHECK (event_type IN ('E1', 'E2', 'E3', 'E4')),
  decided_at        timestamptz NOT NULL,
  published_at      timestamptz NOT NULL,
  horizon           int NOT NULL CHECK (horizon >= 1),
  predicted_bps     int NOT NULL,
  correction        double precision NOT NULL DEFAULT 1,
  est_cost_bps      int NOT NULL,
  outcome           text NOT NULL,
  rules_hash        text NOT NULL,
  realised_car      double precision,
  matured_at        timestamptz
);
CREATE INDEX IF NOT EXISTS predictions_kind_idx ON learn.predictions (event_type, matured_at);

CREATE TABLE IF NOT EXISTS learn.calibration (
  event_type  text PRIMARY KEY CHECK (event_type IN ('E1', 'E2', 'E3', 'E4')),
  n_matured   int NOT NULL DEFAULT 0,
  slope       double precision,
  bias_bps    double precision,
  factor      double precision NOT NULL DEFAULT 1 CHECK (factor > 0),
  active      boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS learn.reports (
  id          bigserial PRIMARY KEY,
  week        date NOT NULL,
  mode        text NOT NULL CHECK (mode IN ('report', 'apply')),
  created_at  timestamptz NOT NULL,
  takeaway_tr text,
  telegram_tr text,
  told_at     timestamptz,
  doc         jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_created_idx ON learn.reports (created_at DESC);

CREATE TABLE IF NOT EXISTS learn.settings (
  id          smallint PRIMARY KEY CHECK (id = 1),
  auto_apply  boolean NOT NULL DEFAULT true,
  updated_at  timestamptz
);
INSERT INTO learn.settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON learn.rule_versions, learn.predictions, learn.calibration, learn.reports,
  learn.settings TO kaptan_app;
GRANT USAGE, SELECT ON SEQUENCE learn.reports_id_seq TO kaptan_app;
"""

DOWN = """
DROP SCHEMA IF EXISTS learn CASCADE;
"""


def upgrade() -> None:
    op.execute(UP)


def downgrade() -> None:
    op.execute(DOWN)
