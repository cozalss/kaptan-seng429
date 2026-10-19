"""`tedbir_sync` (04 §4.1, every 30 min): SPK tedbir / BIST VBTS / trading-halt measures → R04 live.

    stats = await run_tedbir_sync(conn, now)                         # KAP rows + texts already ingested
    stats = await run_tedbir_sync(conn, now, bulletin=spk_bulletin)  # + the SPK bulletin (opt-in)

1. Every KAP notice of the look-back window that names a restriction (`tedbir_parse.parse_notice`;
   the agents keep skipping them, route `avoid:*`) becomes rows of `core.restriction_events`
   (append-only history: kind, start, end/expiry, `available_at`, source disclosure).
2. Lifts ("işlem sırasının açılması", "tedbirin kaldırılması") end the ticker's open measures.
3. The active set (available before `now`, started by the next session, not expired) is written to
   `core.restricted_securities` as `ts:<event id>` rows (what the pre-gate and R04 read); `ts:` rows
   no longer active are deleted. Demo, manual and team-insider rows are never touched.
4. `core.restriction_refresh` gets source `kap_tedbir` (R04's `restrictions_age_h`, via
   `kaptan.risk.desk.mark_restrictions_refreshed`), and `spk_bulletin` when the bulletin ran.

The SPK bulletin is optional (setting `TEDBIR_BULLETIN_URL`, default off): `spk_bulletin_source()`
returns a fetcher (PDF → text with pypdf) or None.
"""

from __future__ import annotations

import io
import logging
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Final

from psycopg.types.json import Jsonb

from kaptan.prices.calendar import CalendarRangeError, istanbul_date, next_session
from kaptan.reference._sql import Conn, execute, execute_many, fetch_all
from kaptan.reference.tedbir_parse import Lift, Measure, Parsed, merge, parse_bulletin_text, parse_notice
from kaptan.settings import Settings

log = logging.getLogger("kaptan.reference.tedbir")

LOOKBACK: Final = timedelta(days=400)
SYNC_ACTOR: Final = "system:tedbir_sync"
ACTIVE_PREFIX: Final = "ts:"
REFRESH_SOURCE: Final = "kap_tedbir"

#: Restriction candidates: the SPK route, BIST/MKK notices (DKB/DUY) and anything whose subject or
#: summary mentions a measure. The parser decides; this only narrows the scan.
CANDIDATES_SQL: Final = """
SELECT d.disclosure_index, d.subject, d.summary, d.subject_route, d.primary_ticker, d.stock_codes,
       d.related_stocks, d.available_at, t.body AS text
  FROM core.disclosures d
  LEFT JOIN core.disclosure_texts t ON t.disclosure_index = d.disclosure_index AND t.lang = 'tr'
 WHERE d.origin = 'kap' AND d.available_at < %(now)s AND d.available_at >= %(since)s AND NOT d.is_noise
   AND (d.subject_route LIKE 'avoid:%%' OR d.disclosure_class IN ('DKB', 'DUY')
        OR lower(d.subject || ' ' || coalesce(d.summary, ''))
           ~ '(tedbir|vbts|takas|a[cç][iı][gğ]a|kredili|tek fiyat|durdur)')
 ORDER BY d.available_at, d.disclosure_index
"""
UPSERT_EVENT_SQL: Final = """
INSERT INTO core.restriction_events (id, ticker, kind, start_date, end_date, expires_at, available_at, source,
  source_disclosure, source_ref, detail, parsed_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (id) DO UPDATE SET
  start_date = EXCLUDED.start_date,
  end_date = CASE WHEN core.restriction_events.detail ? 'lifted_by' THEN core.restriction_events.end_date
                  ELSE EXCLUDED.end_date END,
  expires_at = CASE WHEN core.restriction_events.detail ? 'lifted_by' THEN core.restriction_events.expires_at
                    ELSE EXCLUDED.expires_at END,
  detail = EXCLUDED.detail || (core.restriction_events.detail - 'period' - 'subject' - 'summary'),
  parsed_at = EXCLUDED.parsed_at
"""
LIFT_SQL: Final = """
UPDATE core.restriction_events
   SET end_date = greatest(start_date, %(on)s), expires_at = %(at)s,
       detail = detail || jsonb_build_object('lifted_by', %(idx)s::bigint)
 WHERE ticker = %(ticker)s AND kind = ANY(%(kinds)s::text[]) AND start_date <= %(on)s
   AND available_at < %(at)s AND (expires_at IS NULL OR expires_at > %(at)s)
"""
ACTIVE_SQL: Final = """
SELECT id, ticker, kind, start_date, expires_at, available_at, source_disclosure, source_ref, detail
  FROM core.restriction_events
 WHERE kind <> 'team_insider' AND available_at < %(now)s AND start_date <= %(horizon)s
   AND (expires_at IS NULL OR expires_at > %(now)s)
"""
UPSERT_ACTIVE_SQL: Final = """
INSERT INTO core.restricted_securities (id, ticker, kind, source_ref, added_at, added_by, start_date, expires_at,
  available_at, source_disclosure, detail)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, source_ref = EXCLUDED.source_ref,
  start_date = EXCLUDED.start_date, expires_at = EXCLUDED.expires_at, detail = EXCLUDED.detail
"""
PRUNE_SQL: Final = """
DELETE FROM core.restricted_securities WHERE id LIKE 'ts:%%' AND NOT (id = ANY(%s::text[]))
"""

BulletinText = tuple[str, str, datetime]  # (text, reference, available_at)
BulletinSource = Callable[[], Awaitable[BulletinText | None]]


@dataclass(frozen=True, slots=True)
class TedbirStats:
    scanned: int
    measures: int
    lifts: int
    active: int
    pruned: int
    bulletin_measures: int = 0


def _event_params(m: Measure, now: datetime) -> tuple[Any, ...]:
    return (
        m.id, m.ticker, m.kind, m.start_date, m.end_date, m.expires_at, m.available_at, m.source,
        m.source_disclosure, m.source_ref, Jsonb(m.detail), now,
    )  # fmt: skip


async def _apply_lifts(conn: Conn, lifts: Sequence[Lift]) -> int:
    n = 0
    for lf in sorted(lifts, key=lambda x: x.available_at):
        params = {
            "ticker": lf.ticker,
            "kinds": list(lf.kinds),
            "on": lf.on,
            "at": lf.available_at,
            "idx": lf.source_disclosure,
        }
        n += await execute(conn, LIFT_SQL, params)
    return n


def _horizon(now: datetime) -> Any:
    """Measures that start by the next session already block an order prepared tonight."""
    try:
        return next_session(istanbul_date(now))
    except CalendarRangeError:
        return istanbul_date(now) + timedelta(days=3)


async def _rebuild_active(conn: Conn, now: datetime) -> tuple[int, int]:
    active = await fetch_all(conn, ACTIVE_SQL, {"now": now, "horizon": _horizon(now)})
    params = [
        (
            f"{ACTIVE_PREFIX}{r['id']}", r["ticker"], r["kind"], r["source_ref"], r["available_at"], SYNC_ACTOR,
            r["start_date"], r["expires_at"], r["available_at"], r["source_disclosure"], Jsonb(r["detail"]),
        )
        for r in active
    ]  # fmt: skip
    await execute_many(conn, UPSERT_ACTIVE_SQL, params)
    pruned = await execute(conn, PRUNE_SQL, ([p[0] for p in params],))
    return len(params), pruned


async def _mark_refreshed(conn: Conn, source: str, now: datetime, n_rows: int) -> None:
    from kaptan.risk.desk import mark_restrictions_refreshed  # R04's freshness table (package A2)

    await mark_restrictions_refreshed(conn, source, now, n_rows)


async def run_tedbir_sync(conn: Conn, now: datetime, *, bulletin: BulletinSource | None = None) -> TedbirStats:
    """One sync, in one transaction. Idempotent: re-running with the same data changes nothing."""
    rows = await fetch_all(conn, CANDIDATES_SQL, {"now": now, "since": now - LOOKBACK})
    parsed: Parsed = merge([parse_notice(r, r.get("text")) for r in rows])
    bulletin_measures: list[Measure] = []
    if bulletin is not None:
        got = await bulletin()
        if got is not None:
            text, ref, available_at = got
            if available_at < now:
                bulletin_measures = parse_bulletin_text(text, available_at, ref)
    async with conn.transaction():
        await execute_many(conn, UPSERT_EVENT_SQL, [_event_params(m, now) for m in parsed.measures])
        await execute_many(conn, UPSERT_EVENT_SQL, [_event_params(m, now) for m in bulletin_measures])
        lifted = await _apply_lifts(conn, parsed.lifts)
        n_active, pruned = await _rebuild_active(conn, now)
        await _mark_refreshed(conn, REFRESH_SOURCE, now, n_active)
        if bulletin is not None:
            await _mark_refreshed(conn, "spk_bulletin", now, len(bulletin_measures))
    log.info(
        "tedbir_sync: %d notices, %d measures, %d lifted, %d active, %d pruned",
        len(rows), len(parsed.measures), lifted, n_active, pruned,
    )  # fmt: skip
    return TedbirStats(len(rows), len(parsed.measures), lifted, n_active, pruned, len(bulletin_measures))


def pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def spk_bulletin_source(settings: Settings, *, clock: Callable[[], datetime]) -> BulletinSource | None:
    """The SPK bulletin fetcher when `TEDBIR_BULLETIN_URL` is set (a PDF), else None (the default)."""
    url = settings.tedbir_bulletin_url
    if not url:
        return None

    async def fetch() -> BulletinText | None:
        from kaptan.prices.http import make_http_client

        async with make_http_client(timeout_s=60) as http:
            resp = await http.get(url)
        if resp.status_code != 200 or not resp.content.lstrip().startswith(b"%PDF"):
            log.warning("SPK bulletin: HTTP %s / not a PDF, skipped", resp.status_code)
            return None
        return pdf_text(resp.content), url.rsplit("/", 1)[-1][:80], clock()

    return fetch
