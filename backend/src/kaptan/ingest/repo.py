"""Postgres access for KAP ingestion (parametrised SQL only; callers own the transaction).

Dedup is by `disclosure_index` (07 §3.1): `INSERT … ON CONFLICT (disclosure_index) DO UPDATE` touching
only mutable fields; `published_at` / `available_at` are never updated and `first_seen_at` is only
filled once. Rows with `origin = 'demo'` (the M1 demo day) are never modified by ingestion.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Final

from psycopg import AsyncConnection
from psycopg.errors import UniqueViolation
from psycopg.types.json import Jsonb

from kaptan.ingest.kap_detail import DetailText
from kaptan.ingest.normalize import NormalizedDisclosure, split_codes
from kaptan.text.turkish import clean_text, norm_key

Conn = AsyncConnection[Any]

#: subject_route → the subject-map classification the panel shows (the demo day uses the same shape).
_CLASSIFICATION: Final[dict[str, tuple[str, float]]] = {
    "E1": ("E1", 0.98),
    "E2": ("E2", 0.9),
    "E3": ("E3", 0.95),
    "E4": ("E4", 0.99),
    "archive_only": ("IGNORE", 1.0),
}
KAP_AS_SENDER: Final = "kamuyu aydınlatma platformu"


def classification_for(route: str) -> dict[str, Any] | None:
    """None for noise and for `llm` (the Classifier decides later)."""
    if route.startswith("avoid:"):
        return {"event_type": "FILTER", "confidence": 1.0, "method": "subject_map"}
    hit = _CLASSIFICATION.get(route)
    return None if hit is None else {"event_type": hit[0], "confidence": hit[1], "method": "subject_map"}


def payload_sha256(payload: Any) -> bytes:
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).digest()


# ── issuers ───────────────────────────────────────────────────────────────
@dataclass(slots=True)
class CompanyIndex:
    """Issuer lookup: MKK member OID → (company_id, title); open ticker → (company_id, title)."""

    by_member: dict[str, tuple[int, str]] = field(default_factory=dict)
    by_ticker: dict[str, tuple[int, str]] = field(default_factory=dict)

    def subject_ticker(self, d: NormalizedDisclosure) -> str | None:
        """The first listed code among the row's own codes, then its related stocks. A broker or fund
        manager filing about a listed company carries its own member code in `stockCode`."""
        for code in (*d.stock_codes, *d.related_stocks):
            if code in self.by_ticker:
                return code
        return d.primary_ticker

    def resolve(self, d: NormalizedDisclosure) -> tuple[int | None, str, str | None]:
        """(company_id, display name, primary ticker). The filer's member OID first, then the subject
        ticker; KAP-sent notices (sender "KAMUYU AYDINLATMA PLATFORMU") go to the company they are about."""
        ticker = self.subject_ticker(d)
        own = self.by_member.get(d.member_oid or "")
        sender_is_kap = norm_key(d.company_name) == KAP_AS_SENDER
        if own and not sender_is_kap:
            return own[0], own[1], ticker
        by_code = self.by_ticker.get(ticker or "")
        if by_code:
            return by_code[0], by_code[1], ticker
        if own:
            return own[0], own[1], ticker
        return None, d.company_name, ticker


async def load_company_index(conn: Conn) -> CompanyIndex:
    idx = CompanyIndex()
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT company_id, mkk_member_oid, title FROM core.companies WHERE mkk_member_oid IS NOT NULL"
        )
        for row in await cur.fetchall():
            idx.by_member[row["mkk_member_oid"]] = (int(row["company_id"]), row["title"])
        await cur.execute(
            "SELECT t.ticker, c.company_id, c.title FROM core.tickers t "
            "JOIN core.companies c USING (company_id) WHERE t.valid_to IS NULL"
        )
        for row in await cur.fetchall():
            idx.by_ticker[row["ticker"]] = (int(row["company_id"]), row["title"])
    return idx


UPSERT_COMPANY_SQL: Final = """
INSERT INTO core.companies (kap_member_oid, mkk_member_oid, title, title_norm, member_type, city, is_active, raw)
VALUES (%(kap)s, %(mkk)s, %(title)s, %(title_norm)s, %(type)s, %(city)s, %(active)s, %(raw)s)
ON CONFLICT (kap_member_oid) DO UPDATE SET
  mkk_member_oid = COALESCE(EXCLUDED.mkk_member_oid, core.companies.mkk_member_oid),
  title = EXCLUDED.title, title_norm = EXCLUDED.title_norm, member_type = EXCLUDED.member_type,
  city = EXCLUDED.city, is_active = EXCLUDED.is_active, raw = EXCLUDED.raw, updated_at = now()
RETURNING company_id
"""


async def _open_ticker(conn: Conn, ticker: str, company_id: int, today: date) -> None:
    """Keep one open row per code; a code moving to another company closes the old row (ticker_history)."""
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT company_id, valid_from FROM core.tickers WHERE ticker = %s AND valid_to IS NULL", (ticker,)
        )
        row = await cur.fetchone()
        if row is not None and int(row["company_id"]) == company_id:
            return
        if row is not None:
            end = max(today, row["valid_from"] + timedelta(days=1))
            await cur.execute(
                "UPDATE core.tickers SET valid_to = %s WHERE ticker = %s AND valid_to IS NULL", (end, ticker)
            )
            today = end
        await cur.execute(
            "INSERT INTO core.tickers (ticker, company_id, valid_from) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
            (ticker, company_id, today),
        )


async def upsert_companies(conn: Conn, items: list[dict[str, Any]], today: date) -> int:
    """KAP members (company/items/IGS/A) → core.companies + open core.tickers rows. Returns rows stored."""
    stored = 0
    for item in items:
        kap_oid = clean_text(str(item.get("kapMemberOid") or "")) or None
        title = clean_text(str(item.get("kapMemberTitle") or ""))
        if kap_oid is None or not title:
            continue
        params = {
            "kap": kap_oid,
            "mkk": clean_text(str(item.get("mkkMemberOid") or "")) or None,
            "title": title,
            "title_norm": norm_key(title),
            "type": item.get("kapMemberType"),
            "city": item.get("cityName"),
            "active": str(item.get("kapMemberState") or "A") == "A",
            "raw": Jsonb(item),
        }
        async with conn.cursor() as cur:
            await cur.execute(UPSERT_COMPANY_SQL, params)
            row = await cur.fetchone()
        assert row is not None
        for code in split_codes(item.get("stockCode")):
            await _open_ticker(conn, code, int(row["company_id"]), today)
        stored += 1
    return stored


# ── disclosures ───────────────────────────────────────────────────────────
UPSERT_DISCLOSURE_SQL: Final = """
INSERT INTO core.disclosures AS d (
  disclosure_index, disclosure_oid, stock_codes, related_stocks, primary_ticker, company_name, disclosure_class,
  disclosure_type, subject, summary, reason, related_index, is_late, attachment_count, has_multilang, is_noise,
  subject_route, subject_map_version, published_at, first_seen_at, available_at, ingest_source, classification,
  visible, origin, company_id, member_oid, disclosure_category, fin_year, fin_period, raw)
VALUES (
  %(disclosure_index)s, %(disclosure_oid)s, %(stock_codes)s, %(related_stocks)s, %(primary_ticker)s, %(company_name)s,
  %(disclosure_class)s, %(disclosure_type)s, %(subject)s, %(summary)s, %(reason)s, %(related_index)s, %(is_late)s,
  %(attachment_count)s, %(has_multilang)s, %(is_noise)s, %(subject_route)s, %(subject_map_version)s,
  %(published_at)s, %(first_seen_at)s, %(available_at)s, %(ingest_source)s, %(classification)s,
  %(visible)s, 'kap', %(company_id)s, %(member_oid)s, %(disclosure_category)s, %(fin_year)s, %(fin_period)s, %(raw)s)
ON CONFLICT (disclosure_index) DO UPDATE SET
  disclosure_oid   = COALESCE(d.disclosure_oid, EXCLUDED.disclosure_oid),
  member_oid       = COALESCE(EXCLUDED.member_oid, d.member_oid),
  company_id       = COALESCE(EXCLUDED.company_id, d.company_id),
  related_index    = COALESCE(d.related_index, EXCLUDED.related_index),
  attachment_count = EXCLUDED.attachment_count,
  summary          = CASE WHEN EXCLUDED.summary <> '' THEN EXCLUDED.summary ELSE d.summary END,
  first_seen_at    = COALESCE(d.first_seen_at, EXCLUDED.first_seen_at),
  visible          = d.visible OR EXCLUDED.visible,
  raw              = COALESCE(EXCLUDED.raw, d.raw),
  updated_at       = now()
WHERE d.origin = 'kap'
RETURNING (xmax = 0) AS inserted
"""


def disclosure_params(
    d: NormalizedDisclosure,
    *,
    company_id: int | None,
    company_name: str,
    visible: bool,
    primary_ticker: str | None = None,
) -> dict[str, Any]:
    cls = classification_for(d.subject_route)
    return {
        "disclosure_index": d.disclosure_index,
        "disclosure_oid": d.disclosure_oid,
        "stock_codes": list(d.stock_codes),
        "related_stocks": list(d.related_stocks),
        "primary_ticker": primary_ticker or d.primary_ticker,
        "company_name": company_name or d.company_name or "-",
        "disclosure_class": d.disclosure_class,
        "disclosure_type": d.disclosure_type,
        "subject": d.subject,
        "summary": d.summary,
        "reason": d.reason,
        "related_index": d.related_index,
        "is_late": d.is_late,
        "attachment_count": d.attachment_count,
        "has_multilang": d.has_multilang,
        "is_noise": d.is_noise,
        "subject_route": d.subject_route,
        "subject_map_version": d.subject_map_version,
        "published_at": d.published_at,
        "first_seen_at": d.first_seen_at,
        "available_at": d.available_at,
        "ingest_source": d.ingest_source,
        "classification": None if cls is None else Jsonb(cls),
        "visible": visible,
        "company_id": company_id,
        "member_oid": d.member_oid,
        "disclosure_category": d.disclosure_category,
        "fin_year": d.fin_year,
        "fin_period": d.fin_period,
        "raw": Jsonb(d.raw),
    }


async def upsert_disclosure(conn: Conn, d: NormalizedDisclosure, companies: CompanyIndex, *, visible: bool) -> str:
    """'inserted' | 'updated' | 'skipped' (a demo row owns that index, or its OID is taken)."""
    company_id, name, ticker = companies.resolve(d)
    params = disclosure_params(d, company_id=company_id, company_name=name, visible=visible, primary_ticker=ticker)
    try:
        async with conn.transaction(), conn.cursor() as cur:  # savepoint: one bad row never aborts the batch
            await cur.execute(UPSERT_DISCLOSURE_SQL, params)
            row = await cur.fetchone()
    except UniqueViolation:  # the OID belongs to another index (a demo row)
        return "skipped"
    if row is None:
        return "skipped"
    return "inserted" if row["inserted"] else "updated"


async def max_kap_index(conn: Conn) -> int:
    async with conn.cursor() as cur:
        await cur.execute("SELECT coalesce(max(disclosure_index), 0) AS m FROM core.disclosures WHERE origin = 'kap'")
        row = await cur.fetchone()
    return 0 if row is None else int(row["m"])


async def hide_before(conn: Conn, start: datetime) -> int:
    """Live mode's "today": earlier KAP rows leave the feed (`visible` = part of today's counters)."""
    async with conn.cursor() as cur:
        await cur.execute(
            "UPDATE core.disclosures SET visible = false WHERE origin = 'kap' AND visible AND published_at < %s",
            (start,),
        )
        return cur.rowcount


async def save_raw(conn: Conn, source: str, natural_key: str, payload: Any) -> bool:
    """ops.ingest_raw change history; an identical payload is stored once. True when new."""
    async with conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO ops.ingest_raw (source, natural_key, payload, payload_sha256) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT DO NOTHING",
            (source, natural_key, Jsonb(payload), payload_sha256(payload)),
        )
        return cur.rowcount == 1


# ── detail texts ──────────────────────────────────────────────────────────
async def enqueue_detail(conn: Conn, disclosure_index: int, priority: int) -> None:
    async with conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO ops.detail_fetch_queue (disclosure_index, priority) VALUES (%s, %s) "
            "ON CONFLICT (disclosure_index) DO UPDATE SET priority = LEAST(ops.detail_fetch_queue.priority, "
            "EXCLUDED.priority)",
            (disclosure_index, priority),
        )


CLAIM_SQL: Final = """
UPDATE ops.detail_fetch_queue q SET status = 'running', attempts = q.attempts + 1
 WHERE q.disclosure_index = (
   SELECT disclosure_index FROM ops.detail_fetch_queue
    WHERE status = 'queued' AND next_attempt_at <= %(now)s
    ORDER BY priority, next_attempt_at, disclosure_index
    LIMIT 1 FOR UPDATE SKIP LOCKED)
RETURNING q.disclosure_index, q.attempts,
          (SELECT subject FROM core.disclosures d WHERE d.disclosure_index = q.disclosure_index) AS subject
"""


async def claim_detail(conn: Conn, now: datetime) -> dict[str, Any] | None:
    async with conn.cursor() as cur:
        await cur.execute(CLAIM_SQL, {"now": now})
        row = await cur.fetchone()
    return None if row is None else dict(row)


async def store_detail(conn: Conn, detail: DetailText, parsed: dict[str, Any] | None, reason: str | None) -> None:
    """Texts (one row per language) + the parsed document; the queue row becomes 'done'."""
    async with conn.cursor() as cur:
        for lang, body in detail.texts.items():
            await cur.execute(
                """
                INSERT INTO core.disclosure_texts
                  (disclosure_index, lang, body, body_norm, source, extractor_version, payload_sha256, extracted_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (disclosure_index, lang) DO UPDATE SET
                  body = EXCLUDED.body, body_norm = EXCLUDED.body_norm, source = EXCLUDED.source,
                  extractor_version = EXCLUDED.extractor_version, payload_sha256 = EXCLUDED.payload_sha256,
                  extracted_at = now()
                """,
                (
                    detail.disclosure_index,
                    lang,
                    body,
                    norm_key(body),
                    detail.source,
                    detail.extractor_version,
                    detail.payload_sha256,
                ),
            )
        await cur.execute(
            "UPDATE core.disclosures SET parsed = %s, reason = coalesce(%s, reason), updated_at = now() "
            "WHERE disclosure_index = %s AND origin = 'kap'",
            (None if parsed is None else Jsonb(parsed), reason, detail.disclosure_index),
        )
        await cur.execute(
            "UPDATE ops.detail_fetch_queue SET status = 'done', last_error = NULL WHERE disclosure_index = %s",
            (detail.disclosure_index,),
        )


async def fail_detail(conn: Conn, disclosure_index: int, error: str, *, retry_at: datetime | None) -> None:
    """Back to 'queued' at `retry_at`, or 'failed' for good when it is None."""
    async with conn.cursor() as cur:
        await cur.execute(
            "UPDATE ops.detail_fetch_queue SET status = %s, last_error = %s, next_attempt_at = coalesce(%s, "
            "next_attempt_at) WHERE disclosure_index = %s",
            ("queued" if retry_at else "failed", error[:500], retry_at, disclosure_index),
        )


async def release_running(conn: Conn) -> int:
    """At startup: rows a crashed worker left 'running' go back to the queue."""
    async with conn.cursor() as cur:
        await cur.execute("UPDATE ops.detail_fetch_queue SET status = 'queued' WHERE status = 'running'")
        return cur.rowcount


# ── resumable jobs ────────────────────────────────────────────────────────
async def run_status(conn: Conn, job: str, key: str) -> str | None:
    async with conn.cursor() as cur:
        await cur.execute("SELECT status FROM ops.ingestion_runs WHERE job = %s AND key = %s", (job, key))
        row = await cur.fetchone()
    return None if row is None else str(row["status"])


async def mark_run(
    conn: Conn, job: str, key: str, status: str, *, rows: int | None = None, error: str | None = None
) -> None:
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO ops.ingestion_runs (job, key, status, rows, error, finished_at)
            VALUES (%(job)s, %(key)s, %(status)s, %(rows)s, %(error)s,
                    CASE WHEN %(status)s = 'running' THEN NULL ELSE now() END)
            ON CONFLICT (job, key) DO UPDATE SET
              status = EXCLUDED.status, rows = coalesce(EXCLUDED.rows, ops.ingestion_runs.rows),
              error = EXCLUDED.error, finished_at = EXCLUDED.finished_at,
              attempt = ops.ingestion_runs.attempt + CASE WHEN EXCLUDED.status = 'running' THEN 1 ELSE 0 END,
              started_at = CASE WHEN EXCLUDED.status = 'running' THEN now() ELSE ops.ingestion_runs.started_at END
            """,
            {"job": job, "key": key, "status": status, "rows": rows, "error": None if error is None else error[:500]},
        )
