"""KAP ingestion (M2): issuers/tickers, the rest of 07 §9 core.disclosures / disclosure_texts, ops queues.

Revision ID: 0007
Revises: 0008 (the head when this landed; numbers are package ids, not order)
Create Date: 2026-10-17

M1 columns are kept untouched (the panel's DisclosureListItem reads them). Additions:
- core.companies / core.tickers (07 §9): KAP members (IGS) with their BIST codes, from
  /tr/api/company/items/IGS/A. A disclosure links to its issuer by MKK member OID, else by ticker.
- core.disclosures: `origin` ('demo' for the M1 seed and every existing row, 'kap' for real KAP rows;
  upserts never touch 'demo' rows even if a real index collides), `company_id`, `member_oid`,
  `disclosure_category`, `fin_year`, `fin_period`, `raw` (the list row as received), `parsed` (the
  type-specific parser's document), `updated_at`. `disclosure_oid` and `first_seen_at` become
  nullable: byCriteria (backfill) rows have no OID, and backfill rows were never "seen" live (07 §3.2).
- core.disclosure_texts: `body_norm`, `source`, `extractor_version`, `payload_sha256`, `extracted_at`
  with defaults, so M1's positional 3-column seed insert still works.
- ops.ingest_raw (raw response history), ops.ingestion_runs (resumable backfill), ops.detail_fetch_queue.
"""

from __future__ import annotations

from alembic import op

revision = "0007"
down_revision = "0008"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE core.companies (
  company_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kap_member_oid  text UNIQUE,
  mkk_member_oid  text UNIQUE,
  title           text NOT NULL,
  title_norm      text NOT NULL,
  member_type     text,
  city            text,
  is_active       boolean NOT NULL DEFAULT true,
  aliases         text[] NOT NULL DEFAULT '{}',
  raw             jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (kap_member_oid IS NOT NULL OR mkk_member_oid IS NOT NULL)
);
CREATE INDEX companies_title_norm_idx ON core.companies (title_norm);

CREATE TABLE core.tickers (
  ticker     text NOT NULL CHECK (ticker ~ '^[A-Z0-9]{3,8}$'),
  company_id bigint NOT NULL REFERENCES core.companies(company_id),
  valid_from date NOT NULL,
  valid_to   date,
  PRIMARY KEY (ticker, valid_from),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE INDEX tickers_company_idx ON core.tickers (company_id);

ALTER TABLE core.disclosures
  ALTER COLUMN disclosure_oid DROP NOT NULL,
  ALTER COLUMN first_seen_at DROP NOT NULL,
  ADD COLUMN origin              text NOT NULL DEFAULT 'demo' CHECK (origin IN ('demo', 'kap')),
  ADD COLUMN company_id          bigint REFERENCES core.companies(company_id),
  ADD COLUMN member_oid          text,
  ADD COLUMN disclosure_category text,
  ADD COLUMN fin_year            int,
  ADD COLUMN fin_period          text,
  ADD COLUMN raw                 jsonb,
  ADD COLUMN parsed              jsonb,
  ADD COLUMN updated_at          timestamptz NOT NULL DEFAULT now();
CREATE INDEX disclosures_kap_ticker_idx ON core.disclosures (primary_ticker, published_at DESC) WHERE origin = 'kap';
CREATE INDEX disclosures_company_idx ON core.disclosures (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX disclosures_kap_route_idx ON core.disclosures (subject_route, published_at DESC) WHERE origin = 'kap';

ALTER TABLE core.disclosure_texts
  ADD COLUMN body_norm         text,
  ADD COLUMN source            text NOT NULL DEFAULT 'manual'
                               CHECK (source IN ('bildirim_pdf', 'rsc_payload', 'vyk_html', 'vyk_data', 'manual')),
  ADD COLUMN has_full_report   boolean NOT NULL DEFAULT false,
  ADD COLUMN extractor_version text NOT NULL DEFAULT 'fixture',
  ADD COLUMN payload_sha256    bytea,
  ADD COLUMN extracted_at      timestamptz NOT NULL DEFAULT now();

CREATE TABLE ops.ingest_raw (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source         text NOT NULL,
  natural_key    text NOT NULL,
  payload        jsonb NOT NULL,
  payload_sha256 bytea NOT NULL,
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, natural_key, payload_sha256)
);

CREATE TABLE ops.ingestion_runs (
  job         text NOT NULL,
  key         text NOT NULL,
  status      text NOT NULL CHECK (status IN ('running', 'done', 'failed', 'partial')),
  rows        int,
  attempt     int NOT NULL DEFAULT 1,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error       text,
  PRIMARY KEY (job, key)
);

CREATE TABLE ops.detail_fetch_queue (
  disclosure_index bigint PRIMARY KEY REFERENCES core.disclosures(disclosure_index) ON DELETE CASCADE,
  priority         smallint NOT NULL CHECK (priority BETWEEN 0 AND 9),
  status           text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts         int NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_error       text
);
CREATE INDEX detail_fetch_queue_next_idx ON ops.detail_fetch_queue (priority, next_attempt_at) WHERE status = 'queued';
"""

DOWN = """
DROP TABLE IF EXISTS ops.detail_fetch_queue;
DROP TABLE IF EXISTS ops.ingestion_runs;
DROP TABLE IF EXISTS ops.ingest_raw;
ALTER TABLE core.disclosure_texts
  DROP COLUMN IF EXISTS body_norm, DROP COLUMN IF EXISTS source, DROP COLUMN IF EXISTS has_full_report,
  DROP COLUMN IF EXISTS extractor_version, DROP COLUMN IF EXISTS payload_sha256, DROP COLUMN IF EXISTS extracted_at;
DELETE FROM core.disclosures WHERE origin = 'kap';
DROP INDEX IF EXISTS core.disclosures_kap_route_idx;
DROP INDEX IF EXISTS core.disclosures_company_idx;
DROP INDEX IF EXISTS core.disclosures_kap_ticker_idx;
ALTER TABLE core.disclosures
  DROP COLUMN IF EXISTS origin, DROP COLUMN IF EXISTS company_id, DROP COLUMN IF EXISTS member_oid,
  DROP COLUMN IF EXISTS disclosure_category, DROP COLUMN IF EXISTS fin_year, DROP COLUMN IF EXISTS fin_period,
  DROP COLUMN IF EXISTS raw, DROP COLUMN IF EXISTS parsed, DROP COLUMN IF EXISTS updated_at,
  ALTER COLUMN disclosure_oid SET NOT NULL,
  ALTER COLUMN first_seen_at SET NOT NULL;
DROP TABLE IF EXISTS core.tickers;
DROP TABLE IF EXISTS core.companies;
"""


def _sql(block: str) -> None:
    op.get_bind().exec_driver_sql(block)


def upgrade() -> None:
    _sql(UP)


def downgrade() -> None:
    _sql(DOWN)
