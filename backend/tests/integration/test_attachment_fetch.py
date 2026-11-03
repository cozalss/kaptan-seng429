"""The E2 attachment path against Postgres, offline from real recorded samples (tests/fixtures/kap_attachments)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, Final

import pytest
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from kaptan.agents.db import attachments as stored_attachments
from kaptan.agents.feed import DISCLOSURE_SQL
from kaptan.agents.feed_run import LiveDeps, build_live_context
from kaptan.agents.nodes.analysts import reader
from kaptan.db import DictConn, create_pool
from kaptan.domain.schemas.agents import InsiderTradeExtraction
from kaptan.ingest import repo
from kaptan.ingest.attachment_fetcher import MAX_ATTEMPTS, fetch_attachments_one
from kaptan.ingest.attachment_refetch import EXIT_BLOCKED, run_refetch
from kaptan.ingest.detail_fetcher import fetch_one
from kaptan.ingest.kap_client import KapBlockedError, KapError, KapNotFoundError
from kaptan.ingest.kap_detail import rsc_payload
from kaptan.llm.provider import fingerprint
from kaptan.settings import Settings
from tests.harness.replay import Cassette, Recording, ReplayProvider, ReplayToolbox
from tests.ingest_support import FIXTURES, FakeKap

pytestmark = pytest.mark.integration

ATT: Final = FIXTURES / "kap_attachments"
SOON: Final = datetime.now(UTC).replace(microsecond=0) + timedelta(days=1)
ORGE: Final = 1690388
ORGE_BODY: Final = (
    "Pay Alım Satım Bildirimi\nYapılan açıklama düzeltme mi? Hayır\nİlgili Şirketler ORGE\nAçıklamalar\n"
    "Sermaye Piyasası Kurulu'nun Seri: II, No:15.1 Sayılı Tebliği kapsamında Nevhan Gündüz\n"
    "tarafından Kuruluşumuza gönderilen pay alım satım işlemlerine ilişkin açıklama ekte yer almaktadır."
)
CLEAN_SQL: Final = """
DELETE FROM ops.attachment_fetch_queue;
DELETE FROM ops.detail_fetch_queue;
DELETE FROM core.disclosure_attachments;
DELETE FROM core.disclosure_texts t USING core.disclosures d
 WHERE d.disclosure_index = t.disclosure_index AND d.origin = 'kap';
DELETE FROM core.disclosures WHERE origin = 'kap';
"""
INSERT_SQL: Final = """
INSERT INTO core.disclosures (disclosure_index, disclosure_oid, stock_codes, related_stocks, primary_ticker,
  company_name, disclosure_class, disclosure_type, subject, summary, reason, is_late, attachment_count, has_multilang,
  is_noise, subject_route, subject_map_version, published_at, first_seen_at, available_at, ingest_source, visible,
  origin, parsed)
VALUES (%(idx)s, %(oid)s, '{}', '{ORGE}', 'ORGE', 'ORGE ENERJİ ELEKTRİK TAAHHÜT A.Ş.', 'DUY', 'ODA',
  'Pay Alım Satım Bildirimi', 'Pay Alım Satım Bildirimi', 'NEW', false, %(count)s, false, false, 'E2', 'v1',
  %(at)s, %(at)s,
  %(at)s, 'live', true, 'kap', %(parsed)s)
"""
ATTACHMENT_ONLY: Final = {"kind": "insider_trade", "rows": [], "status": "attachment_only", "is_correction": False}


class AttachmentKap(FakeKap):
    """FakeKap + the recorded attachment pages and files. `pages` / `files` override by index / object id."""

    def __init__(self) -> None:
        super().__init__(lists={})
        self.pages: dict[int, str] = {ORGE: (ATT / "1690388_page.html").read_text(encoding="utf-8")}
        self.files: dict[str, bytes] = {"4028328ca17e4f5f01a19abf848b2433": (ATT / "1690388_1.bin").read_bytes()}

    async def bildirim_html(self, idx: int, *, retries: int | None = None) -> str:
        self.calls.append(("bildirim_html", idx))
        self._maybe_raise("bildirim_html")
        return self.pages[idx]

    async def attachment(self, obj_id: str, idx: int) -> bytes:
        self.calls.append(("attachment", obj_id))
        self._maybe_raise("attachment")
        if obj_id not in self.files:
            raise KapNotFoundError(obj_id)
        return self.files[obj_id]


@pytest.fixture
async def ipool(seeded: Any, migrated: Settings) -> AsyncIterator[AsyncConnectionPool[DictConn]]:
    pool = create_pool(migrated.database_url.get_secret_value(), min_size=1, max_size=3)
    await pool.open(wait=True)
    async with pool.connection() as conn:
        await conn.execute(CLEAN_SQL)
    try:
        yield pool
    finally:
        async with pool.connection() as conn:
            await conn.execute(CLEAN_SQL)
        await pool.close()


async def add_e2(
    pool: AsyncConnectionPool[DictConn],
    idx: int = ORGE,
    *,
    count: int = 1,
    parsed: dict[str, Any] | None = ATTACHMENT_ONLY,
    body: str | None = ORGE_BODY,
    queue_priority: int | None = 0,
) -> None:
    at = datetime(2026, 11, 2, 6, 13, tzinfo=UTC)
    params = {
        "idx": idx,
        "oid": f"oid-{idx}",
        "count": count,
        "at": at,
        "parsed": None if parsed is None else Jsonb(parsed),
    }
    async with pool.connection() as conn:
        await conn.execute(INSERT_SQL, params)
        if body is not None:
            await conn.execute(
                "INSERT INTO core.disclosure_texts (disclosure_index, lang, body) VALUES (%s, 'tr', %s)", (idx, body)
            )
        if queue_priority is not None:
            await repo.enqueue_attachments(conn, idx, queue_priority)


async def one(pool: AsyncConnectionPool[DictConn], sql: str, *args: Any) -> dict[str, Any]:
    async with pool.connection() as conn:
        cur = await conn.execute(sql, args)
        row = await cur.fetchone()
    assert row is not None
    return dict(row)


async def parsed_of(pool: AsyncConnectionPool[DictConn], idx: int = ORGE) -> dict[str, Any]:
    return (await one(pool, "SELECT parsed FROM core.disclosures WHERE disclosure_index = %s", idx))["parsed"]


async def queue_of(pool: AsyncConnectionPool[DictConn], idx: int = ORGE) -> dict[str, Any]:
    return await one(pool, "SELECT * FROM ops.attachment_fetch_queue WHERE disclosure_index = %s", idx)


def later() -> datetime:
    return SOON


# ── the happy path ───────────────────────────────────────────────────────
async def test_a_live_row_gets_its_real_file_rows_and_goes_to_the_agents(
    ipool: AsyncConnectionPool[DictConn],
) -> None:
    await add_e2(ipool)
    kap = AttachmentKap()
    settled: list[int] = []

    async def on_settled(idx: int) -> None:
        settled.append(idx)

    assert await fetch_attachments_one(ipool, kap, later, on_settled) == ORGE
    assert settled == [ORGE]
    assert [c[0] for c in kap.calls] == ["bildirim_html", "attachment"]
    doc = await parsed_of(ipool)
    assert doc["status"] == "ok" and doc["attachment_status"] == "read" and doc["direction"] == "buy"
    assert doc["rows"][0]["buy_nominal_try"] == "1000000" and doc["rows"][0]["end_nominal_try"] == "71424459.78"
    assert doc["price_low_try"] == "17.41" and doc["rows"][0]["date"] == "2026-10-30"
    assert (await queue_of(ipool))["status"] == "done"
    row = await one(ipool, "SELECT * FROM core.disclosure_attachments WHERE disclosure_index = %s", ORGE)
    assert row["status"] == "read" and row["file_name"] == "ORGE_56698.pdf" and row["pages"] == 1
    assert row["body"].startswith("Pay Alım Satım Bilgileri (ek belgedeki tablodan)")
    assert await fetch_attachments_one(ipool, kap, later) is None


async def test_the_stored_notice_body_is_not_changed(ipool: AsyncConnectionPool[DictConn]) -> None:
    await add_e2(ipool)
    await fetch_attachments_one(ipool, AttachmentKap(), later)
    row = await one(ipool, "SELECT body FROM core.disclosure_texts WHERE disclosure_index = %s", ORGE)
    assert row["body"] == ORGE_BODY


# ── honest failure ───────────────────────────────────────────────────────
async def test_a_scanned_file_settles_with_its_reason(ipool: AsyncConnectionPool[DictConn]) -> None:
    from tests.unit.test_kap_attachments import _image_only_pdf

    await add_e2(ipool)
    kap = AttachmentKap()
    kap.files["4028328ca17e4f5f01a19abf848b2433"] = _image_only_pdf()
    settled: list[int] = []

    async def on_settled(idx: int) -> None:
        settled.append(idx)

    await fetch_attachments_one(ipool, kap, later, on_settled)
    doc = await parsed_of(ipool)
    assert doc["status"] == "attachment_unreadable" and doc["rows"] == []
    assert doc["attachment_reason"] == "Ek taranmış görüntü; metni okunamadı."
    assert settled == [ORGE]  # the run goes ahead and abstains; it does not wait for ever


async def test_download_failures_retry_then_settle_honestly(ipool: AsyncConnectionPool[DictConn]) -> None:
    await add_e2(ipool)
    kap = AttachmentKap()
    kap.errors["attachment"] = [KapError("boom") for _ in range(MAX_ATTEMPTS)]
    settled: list[int] = []

    async def on_settled(idx: int) -> None:
        settled.append(idx)

    at = later()
    for attempt in range(1, MAX_ATTEMPTS):
        assert await fetch_attachments_one(ipool, kap, lambda t=at: t, on_settled) == ORGE
        row = await queue_of(ipool)
        assert row["status"] == "queued" and row["attempts"] == attempt and settled == []
        at = row["next_attempt_at"]
    assert await fetch_attachments_one(ipool, kap, lambda t=at: t, on_settled) == ORGE
    doc = await parsed_of(ipool)
    assert doc["status"] == "attachment_unreadable" and doc["attachment_reason"] == "Ek KAP'tan indirilemedi."
    assert (await queue_of(ipool))["status"] == "done" and settled == [ORGE]


async def test_a_waf_signal_requeues_and_propagates(ipool: AsyncConnectionPool[DictConn]) -> None:
    await add_e2(ipool)
    kap = AttachmentKap()
    kap.errors["bildirim_html"] = [KapBlockedError("waf")]
    with pytest.raises(KapBlockedError):
        await fetch_attachments_one(ipool, kap, later)
    row = await queue_of(ipool)
    assert row["status"] == "queued" and row["next_attempt_at"] > later() + timedelta(minutes=9)


async def test_a_waf_signal_on_the_file_itself_also_requeues(ipool: AsyncConnectionPool[DictConn]) -> None:
    await add_e2(ipool)
    kap = AttachmentKap()
    kap.errors["attachment"] = [KapBlockedError("waf")]
    with pytest.raises(KapBlockedError):
        await fetch_attachments_one(ipool, kap, later)
    row = await queue_of(ipool)
    assert row["status"] == "queued" and row["last_error"] == "waf"


async def test_a_page_that_lists_nothing_says_so(ipool: AsyncConnectionPool[DictConn]) -> None:
    await add_e2(ipool)
    kap = AttachmentKap()
    kap.pages[ORGE] = "<html></html>"
    await fetch_attachments_one(ipool, kap, later)
    assert (await parsed_of(ipool))["attachment_reason"] == "Ek bildirim sayfasında bulunamadı."


async def test_a_retry_pays_only_for_the_file_it_is_missing(ipool: AsyncConnectionPool[DictConn]) -> None:
    idx = 1690404
    await add_e2(ipool, idx, count=2)
    kap = AttachmentKap()
    kap.pages[idx] = (ATT / "1690404_page.html").read_text(encoding="utf-8")
    first, second = "4028328da17e515f01a19ae56bf72299", "4028328da17e515f01a19ae56c08229a"
    kap.files[first] = (ATT / "1690388_1.bin").read_bytes()
    kap.errors["attachment"] = [KapError("boom")]  # the first file fails; nothing is stored, the row retries
    await fetch_attachments_one(ipool, kap, later)
    assert (await queue_of(ipool, idx))["status"] == "queued"
    async with ipool.connection() as conn:
        await repo.store_attachments(
            conn,
            idx,
            [
                {
                    "obj_id": first,
                    "file_name": "EFOR TR.pdf",
                    "file_ext": "pdf",
                    "position": 0,
                    "status": "read",
                    "reason": None,
                    "reason_tr": None,
                    "body": (ATT / "1690404_1.txt").read_text(encoding="utf-8"),
                    "lang": "tr",
                    "pages": 1,
                    "n_bytes": 1,
                    "payload_sha256": None,
                    "text_sha256": None,
                    "extractor_version": "t",
                }
            ],
        )
    kap.calls.clear()
    kap.files[second] = b"not a pdf"
    at = (await queue_of(ipool, idx))["next_attempt_at"]
    await fetch_attachments_one(ipool, kap, lambda: at)
    assert ("attachment", first) not in kap.calls and ("attachment", second) in kap.calls
    assert (await parsed_of(ipool, idx))["rows"][0]["sell_nominal_try"] == "1160980"


# ── the detail step and the feed ─────────────────────────────────────────
async def test_the_detail_step_queues_the_attachment_and_holds_the_text_stage(
    ipool: AsyncConnectionPool[DictConn],
) -> None:
    await add_e2(ipool, parsed=None, body=None, queue_priority=None)
    async with ipool.connection() as conn:
        await repo.enqueue_detail(conn, ORGE, 0)
    kap = AttachmentKap()
    pdf = (FIXTURES / "detail_text" / "1683269.txt").read_text(encoding="utf-8")

    class Detail(AttachmentKap):
        async def bildirim_pdf(self, idx: int) -> bytes:
            raise KapError("force the page")

    detail = Detail()
    detail.pages[ORGE] = _page_with_form(pdf)
    stored: list[int] = []

    async def on_stored(idx: int) -> None:
        stored.append(idx)

    assert await fetch_one(ipool, detail, later, on_stored, attachments=True) == ORGE
    assert stored == []  # the `text` stage waits for the attachment
    assert (await queue_of(ipool))["status"] == "queued"
    row = await one(ipool, DISCLOSURE_SQL, ORGE)
    assert row["has_text"] is False  # so a `listed` entry read now cannot start a run without the table
    await fetch_attachments_one(ipool, kap, later)
    assert (await one(ipool, DISCLOSURE_SQL, ORGE))["has_text"] is True


async def test_without_the_flag_the_detail_step_behaves_as_before(ipool: AsyncConnectionPool[DictConn]) -> None:
    await add_e2(ipool, parsed=None, body=None, queue_priority=None)
    async with ipool.connection() as conn:
        await repo.enqueue_detail(conn, ORGE, 0)

    class Detail(AttachmentKap):
        async def bildirim_pdf(self, idx: int) -> bytes:
            raise KapError("force the page")

    detail = Detail()
    detail.pages[ORGE] = _page_with_form("Açıklama ekte yer almaktadır.")
    stored: list[int] = []

    async def on_stored(idx: int) -> None:
        stored.append(idx)

    await fetch_one(ipool, detail, later, on_stored)
    assert stored == [ORGE]
    async with ipool.connection() as conn:
        cur = await conn.execute("SELECT 1 FROM ops.attachment_fetch_queue WHERE disclosure_index = %s", (ORGE,))
        assert await cur.fetchone() is None


def _page_with_form(text: str) -> str:
    html = f"<table><tr><td>{text}</td></tr></table>"
    row = f"3f:T{len(html.encode('utf-8')):x},{html}"
    return f"<script>self.__next_f.push([1,{json.dumps(row, ensure_ascii=False)}])</script>"


# ── the re-fetch job ─────────────────────────────────────────────────────
async def test_the_job_covers_stored_rows_is_resumable_and_starts_no_run(
    ipool: AsyncConnectionPool[DictConn],
) -> None:
    other = 1690392
    await add_e2(ipool, queue_priority=None)
    await add_e2(ipool, other, queue_priority=None)
    await add_e2(ipool, 1690400, count=0, queue_priority=None)  # no attachment: not its business
    kap = AttachmentKap()
    kap.pages[other] = "<html></html>"
    settled: list[int] = []

    async def fetch(pool: Any, client: Any, *, job_rows: bool) -> int | None:
        return await fetch_attachments_one(pool, client, later, settled.append, job_rows=job_rows)  # type: ignore[arg-type]

    first = await run_refetch(ipool, kap, limit=1, fetch=fetch)
    assert first.pending == 2 and first.processed == 1 and not first.blocked
    second = await run_refetch(ipool, kap, limit=5, fetch=fetch)
    assert second.pending == 1 and second.processed == 1
    third = await run_refetch(ipool, kap, limit=5, fetch=fetch)
    assert third.pending == 0 and third.processed == 0
    assert settled == []  # the job never wakes the agents
    assert (await parsed_of(ipool))["attachment_status"] == "read"
    assert (await parsed_of(ipool, other))["attachment_status"] == "unreadable"


async def test_the_live_loop_does_not_take_job_rows_or_the_other_way_round(
    ipool: AsyncConnectionPool[DictConn],
) -> None:
    await add_e2(ipool, queue_priority=repo.ATTACHMENT_JOB_PRIORITY)
    assert await fetch_attachments_one(ipool, AttachmentKap(), later) is None
    assert await fetch_attachments_one(ipool, AttachmentKap(), later, job_rows=True) == ORGE


async def test_the_job_stops_at_a_waf_signal(ipool: AsyncConnectionPool[DictConn]) -> None:
    await add_e2(ipool, queue_priority=None)
    kap = AttachmentKap()
    kap.errors["bildirim_html"] = [KapBlockedError("waf")]

    async def fetch(pool: Any, client: Any, *, job_rows: bool) -> int | None:
        return await fetch_attachments_one(pool, client, later, job_rows=job_rows)

    report = await run_refetch(ipool, kap, limit=5, fetch=fetch)
    assert report.blocked and report.processed == 0 and EXIT_BLOCKED == 2
    assert (await queue_of(ipool))["status"] == "queued"


async def test_the_job_replaces_the_old_react_payload_with_the_form(ipool: AsyncConnectionPool[DictConn]) -> None:
    idx = 1690912
    await add_e2(ipool, idx, body='1:"$Sreact.fragment"\n2:"junk"', parsed=ATTACHMENT_ONLY, queue_priority=None)
    kap = AttachmentKap()
    kap.pages[idx] = (ATT / "1690912_page.html").read_text(encoding="utf-8")
    kap.files["4028328ca17e4f5d01a19c4fed576489"] = (ATT / "1690388_1.bin").read_bytes()

    async def fetch(pool: Any, client: Any, *, job_rows: bool) -> int | None:
        return await fetch_attachments_one(pool, client, later, job_rows=job_rows)

    await run_refetch(ipool, kap, limit=1, fetch=fetch)
    row = await one(ipool, "SELECT body, source FROM core.disclosure_texts WHERE disclosure_index = %s", idx)
    assert "Bank Of America Corporation tarafından Kuruluşumuza" in row["body"] and "$Sreact" not in row["body"]
    assert row["source"] == "rsc_payload" and rsc_payload("") == ""


# ── the Reader ───────────────────────────────────────────────────────────
READER_OK: Final = {
    "kind": "E2",
    "status": "ok",
    "confidence": 0.9,
    "injection_suspected": False,
    "quotes": [{"field": "trade_date", "quote": "30/10/2026"}],
    "notes_tr": "Okundu.",
    "abstain": None,
    "filer_kind": "person",
    "person_or_entity": "KİŞİ_1",
    "role": "unknown",
    "legal_basis": "II-15.1 md.13",
    "direction": "buy",
    "trades": [{"trade_date": "2026-10-30", "qty": 1000000.0, "price_tl": None, "value_tl": None}],
    "holding_before_pct": 17.61,
    "holding_after_pct": 17.86,
    "open_market": None,
    "non_market_reason": None,
}
#: What the Reader really answered on the bare notice on 2026-11-02 (run-live-1690388), name masked.
READER_ABSTAINED: Final = {
    **READER_OK,
    "status": "abstain",
    "confidence": 0.4,
    "quotes": [{"field": "person_or_entity", "quote": "açıklama ekte yer almaktadır."}],
    "notes_tr": "Detaylar ek dosyada yer almaktadır.",
    "abstain": {"reason": "insufficient_text", "detail_tr": "Bildirim metninde işlem tablosu yer almamaktadır."},
    "direction": "mixed",
    "trades": [],
    "holding_before_pct": None,
    "holding_after_pct": None,
}


def _recording(ticker: str, text: str, answer: dict[str, Any]) -> Recording:
    return Recording(
        run_id="r", ticker=ticker, fingerprint=fingerprint(ticker, text), outputs={"reader": answer}, node_usage={}
    )


async def _reader_on_stored_row(conn: DictConn, provider: Any) -> dict[str, Any]:
    deps = LiveDeps(provider=provider, tools=ReplayToolbox(Cassette([])))
    ctx, _doc, _texts = await build_live_context(conn, ORGE, deps, later())
    state: dict[str, Any] = {"event_type": "E2", "route": {"route": "E2", "sub_type_hint": None}, "steps": []}
    return await reader(state, SimpleNamespace(context=ctx))  # type: ignore[arg-type]


async def test_the_reader_on_replay_reads_the_attachment_and_no_longer_abstains(
    ipool: AsyncConnectionPool[DictConn],
) -> None:
    await add_e2(ipool)
    async with ipool.connection() as conn:
        # Before the attachment: the text is the bare notice, and the recorded answer is the live abstain.
        before = ReplayProvider(Cassette([_recording("ORGE", ORGE_BODY, READER_ABSTAINED)]))
        out = await _reader_on_stored_row(conn, before)
        assert out["reader"]["status"] == "abstain"
    await fetch_attachments_one(ipool, AttachmentKap(), later)
    async with ipool.connection() as conn:
        deps = LiveDeps(provider=ReplayProvider(Cassette([])), tools=ReplayToolbox(Cassette([])))
        ctx, _doc, texts = await build_live_context(conn, ORGE, deps, later())
        text = ctx.disclosure.text_tr
        assert text.startswith(ORGE_BODY) and "[EK BELGE 1/1" in text
        assert "30/10/2026 | 1.000.000 | 0 | 1.000.000 | 70.424.459,78 | 71.424.459,78" in text
        assert texts[0]["body"] == text  # the run's stored texts show what the Reader read
        wrong = {**READER_OK, "trades": [{"trade_date": "2026-10-30", "qty": 7.0, "price_tl": None, "value_tl": None}]}
        provider = ReplayProvider(Cassette([_recording("ORGE", text, wrong)]))
        out = await _reader_on_stored_row(conn, provider)
    doc = out["reader"]
    InsiderTradeExtraction.model_validate(doc)
    assert doc["status"] == "ok" and doc["abstain"] is None
    assert doc["trades"][0]["qty"] == 1000000.0  # from the verified table, not from the model
    assert doc["holding_after_pct"] == 17.86 and out["llm_calls"] == 1


async def test_an_unreadable_attachment_never_reaches_a_model(ipool: AsyncConnectionPool[DictConn]) -> None:
    from tests.unit.test_kap_attachments import _image_only_pdf

    await add_e2(ipool)
    kap = AttachmentKap()
    kap.files["4028328ca17e4f5f01a19abf848b2433"] = _image_only_pdf()
    await fetch_attachments_one(ipool, kap, later)

    class NoModel:
        name = "none"

        async def complete(self, request: Any) -> Any:
            raise AssertionError(f"a model was asked: {request.agent}")

    async with ipool.connection() as conn:
        files = await stored_attachments(conn, ORGE)
        assert files[0]["status"] == "unreadable"
        out = await _reader_on_stored_row(conn, NoModel())
    doc = out["reader"]
    InsiderTradeExtraction.model_validate(doc)
    assert doc["status"] == "abstain" and doc["abstain"]["reason"] == "attachment_missing"
    assert doc["abstain"]["detail_tr"] == "Ek taranmış görüntü; metni okunamadı." and doc["trades"] == []
    assert out["llm_calls"] == 0 and out["steps"][0]["status"] == "skipped"
