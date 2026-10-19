"""RAG (M2): `rag.rag_chunks`, the disclosure archive's chunks with their embeddings (07 §9 rag, §10, §11).

Revision ID: 0012
Revises: 0010 (the head when this landed; numbers are package ids, not order)
Create Date: 2026-10-18

Follows 07's `rag.rag_chunks` (one table for the three bases, `base_type` tells them apart; M2 fills
`disclosure_archive` only). Deviations, on purpose:
- `embed_version` next to `embed_model`: every vector says which model *and* version made it; the
  retriever only compares vectors of the embedder it runs with.
- `embedding vector(1024)`: bge-m3's size (04 ADR-002); Gemini `gemini-embedding-001` is truncated to
  1024 (Matryoshka) and L2-normalised, so both fit the same column.
- `event_code` holds the event type (E1–E4, from the subject route / classification) for the filter.
- No foreign key to core.disclosures: /demo/reset truncates that table (CASCADE would empty this
  one, regulation and event-memory chunks included); the retriever joins core.disclosures instead,
  so a chunk whose disclosure is gone is never returned.
- `content_norm` is filled by the app (`kaptan.text.norm_key`, Turkish lower case), no ICU trigger.
HNSW with cosine distance (`m = 16, ef_construction = 64`); the full-text leg uses the `turkish`
configuration on `content_norm`, the trigram leg `pg_trgm` (extension from 0001).
"""

from __future__ import annotations

from alembic import op

revision = "0012"
down_revision = "0010"
branch_labels = None
depends_on = None

UP = """
CREATE SCHEMA IF NOT EXISTS rag;

CREATE TABLE rag.rag_chunks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_type        text NOT NULL CHECK (base_type IN ('disclosure_archive', 'event_memory', 'regulation')),
  doc_kind         text NOT NULL CHECK (doc_kind IN ('disclosure', 'summary', 'attachment', 'fin_report',
                                                     'event', 'regulation', 'policy')),
  doc_ref          text NOT NULL,
  chunk_no         int NOT NULL CHECK (chunk_no >= 0),
  lang             text NOT NULL CHECK (lang IN ('tr', 'en')),
  ticker           text,
  event_code       text,
  disclosure_index bigint,
  event_id         bigint,
  published_at     timestamptz NOT NULL,
  available_at     timestamptz NOT NULL,
  valid_to         timestamptz,
  content          text NOT NULL,
  content_norm     text NOT NULL,
  content_sha256   bytea NOT NULL,
  token_count      int NOT NULL CHECK (token_count > 0),
  embedding        vector(1024) NOT NULL,
  embed_model      text NOT NULL,
  embed_version    text NOT NULL,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  tsv              tsvector GENERATED ALWAYS AS (to_tsvector('turkish', content_norm)) STORED,
  UNIQUE (doc_ref, chunk_no, lang, embed_model),
  CHECK (available_at >= published_at)
);

CREATE INDEX rag_chunks_hnsw ON rag.rag_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX rag_chunks_filter_idx ON rag.rag_chunks (base_type, embed_model, available_at);
CREATE INDEX rag_chunks_ticker_idx ON rag.rag_chunks (ticker, published_at) WHERE ticker IS NOT NULL;
CREATE INDEX rag_chunks_disclosure_idx ON rag.rag_chunks (disclosure_index) WHERE disclosure_index IS NOT NULL;
CREATE INDEX rag_chunks_tsv_gin ON rag.rag_chunks USING gin (tsv);
CREATE INDEX rag_chunks_trgm_gin ON rag.rag_chunks USING gin (content_norm gin_trgm_ops);

GRANT USAGE ON SCHEMA rag TO kaptan_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON rag.rag_chunks TO kaptan_app;
"""

DOWN = """
DROP TABLE IF EXISTS rag.rag_chunks;
DROP SCHEMA IF EXISTS rag;
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
