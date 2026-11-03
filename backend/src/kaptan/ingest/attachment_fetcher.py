"""Attachment queue consumer: one disclosure at a time → its files' text + the trade rows.

Only what the Reader needs goes here: an E2 disclosure that says it has attachments and whose own form holds no
trade table (`detail_fetcher` queues them), about 20 a day out of 350. The loop runs beside the poller and the
detail loop (same KapClient, so the same pacing), so a slow file delays only its own disclosure's run: `agents.feed`
holds that run until this row is settled, then the `text` stage goes out.

Failures: a download that fails retries after 1 and 2 min, then the disclosure is settled honestly with "Ek KAP'tan
indirilemedi" and the Reader abstains (`agents.reader_facts`). A WAF signal re-queues for 10 min and
propagates so the worker pauses. Files already read are not fetched again, so a retry or a re-run only pays for
what is missing. Priority 0 = live; the re-fetch job (`attachment_refetch`) works the rest and starts no run.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Final

from kaptan.ingest import repo
from kaptan.ingest.attachments import (
    EXTRACTOR_VERSION,
    MAX_FILES,
    REASONS_TR,
    AttachmentRef,
    ExtractedFile,
    extract_attachment,
    page_attachments,
    unreadable,
)
from kaptan.ingest.detail_fetcher import reason_from
from kaptan.ingest.kap_client import FALLBACK_RETRIES, KapBlockedError, KapClient, KapError, KapNotFoundError
from kaptan.ingest.kap_detail import DetailText, rsc_payload, rsc_texts
from kaptan.ingest.parsers import parse_detail
from kaptan.ingest.parsers.common import jsonable
from kaptan.ingest.parsers.insider_form import FormTable, merge_form, parse_form, table_block

log = logging.getLogger("kaptan.ingest.attachments")

MAX_ATTEMPTS: Final = 3
BLOCKED_RETRY: Final = timedelta(minutes=10)
EXTRACT_TIMEOUT_S: Final = 20.0  # a hostile PDF must not hold the worker; pypdf runs in a thread
RSC_NOISE_PREFIX: Final = '1:"$S'  # how the old fallback's "text" (the React payload) starts
#: A row with no attachment list to point at (the page could not be fetched or listed nothing).
NO_FILE_ID: Final = "-"


def retry_delay(attempts: int) -> timedelta:
    return timedelta(minutes=1) * (1 << max(0, attempts - 1))


@dataclass(frozen=True, slots=True)
class FileRow:
    """A row of core.disclosure_attachments as `repo.store_attachments` writes it."""

    obj_id: str
    file_name: str
    file_ext: str
    position: int
    got: ExtractedFile
    body: str

    @property
    def params(self) -> dict[str, Any]:
        return {
            "obj_id": self.obj_id,
            "file_name": self.file_name[:300],
            "file_ext": self.file_ext[:16],
            "position": self.position,
            "status": self.got.status,
            "reason": self.got.reason,
            "reason_tr": self.got.reason_tr,
            "body": self.body,
            "lang": self.got.lang,
            "pages": self.got.pages,
            "n_bytes": self.got.n_bytes,
            "payload_sha256": self.got.payload_sha256,
            "text_sha256": hashlib.sha256(self.body.encode("utf-8")).digest() if self.body else None,
            "extractor_version": EXTRACTOR_VERSION,
        }


async def _extract(ref: AttachmentRef, data: bytes) -> ExtractedFile:
    try:
        return await asyncio.wait_for(asyncio.to_thread(extract_attachment, ref, data), EXTRACT_TIMEOUT_S)
    except TimeoutError:
        log.warning("attachment %s: extraction timed out", ref.obj_id)
        return unreadable("timeout", n_bytes=len(data))


def _reader_body(got: ExtractedFile, form: FormTable | None) -> str:
    """The file's text; a verified table goes first, named column by column, so the Reader's cap never cuts it."""
    if form is None or not form.rows:
        return got.text
    return f"{table_block(form.rows)}\n\n{got.text}"


async def _read_file(client: Any, index: int, position: int, ref: AttachmentRef) -> FileRow:
    try:
        data = await client.attachment(ref.obj_id, index)
    except KapNotFoundError:
        got = unreadable("download")
    else:
        got = await _extract(ref, data)
    form = parse_form(got.text) if got.status == "read" else None
    return FileRow(ref.obj_id, ref.file_name, ref.file_ext, position, got, _reader_body(got, form))


def _missing_row(reason: str) -> FileRow:
    return FileRow(NO_FILE_ID, "", "", 0, unreadable(reason), "")


def combine_forms(bodies: list[tuple[str, str]]) -> FormTable | None:
    """The table of the first readable file that has one, Turkish before English; else the first text's result."""
    forms = [parse_form(text) for _lang, text in sorted(bodies, key=lambda b: b[0] != "tr")]
    for form in forms:
        if form.rows:
            return form
    return next((f for f in forms if f.rejected), forms[0] if forms else None)


def first_reason(rows: list[dict[str, Any]]) -> str:
    return next((str(r["reason_tr"]) for r in rows if r["status"] != "read" and r["reason_tr"]), REASONS_TR["download"])


async def _settle(conn: Any, index: int, parsed: Mapping[str, Any] | None, new_rows: list[FileRow]) -> None:
    """Write the new files and the document merged from *all* of the disclosure's files, in one transaction."""
    async with conn.transaction():
        await repo.store_attachments(conn, index, [r.params for r in new_rows])
        stored = await repo.attachments_of(conn, index)
        readable = [(str(r["lang"]), str(r["body"])) for r in stored if r["status"] == "read"]
        form = combine_forms(readable)
        doc = merge_form(parsed, form, unreadable=None if form is not None else first_reason(stored))
        await repo.store_attachment_document(conn, index, jsonable(doc), reason_from(doc))


async def _repair_text(conn: Any, index: int, page: str, body: str | None) -> dict[str, Any] | None:
    """Re-fetch job only: a row with no text, or with the old fallback's React payload, gets its form from the page
    this job already downloaded. Returns the new parsed document, or None when nothing changed."""
    if body is not None and not body.startswith(RSC_NOISE_PREFIX):
        return None
    payload = rsc_payload(page)
    texts = rsc_texts(payload) if payload else {"tr": ""}
    if not texts["tr"]:
        return None
    sha = hashlib.sha256(payload.encode("utf-8")).digest()
    parsed = parse_detail("Pay Alım Satım Bildirimi", texts["tr"])
    async with conn.transaction():
        await repo.store_detail(conn, DetailText(index, texts, "rsc_payload", sha), parsed, reason_from(parsed))
    return parsed


async def _process(conn: Any, client: Any, job: Mapping[str, Any], *, repair_text: bool) -> None:
    """Page → list → the files not read yet → settle. Download failures raise KapError for the queue to retry."""
    index = int(job["disclosure_index"])
    page = await client.bildirim_html(index, retries=FALLBACK_RETRIES)
    parsed = job["parsed"]
    if repair_text:
        parsed = await _repair_text(conn, index, page, job["body"]) or parsed
    refs = page_attachments(page)[:MAX_FILES]
    done = await repo.read_attachment_ids(conn, index)
    await conn.commit()  # nothing held open while files download, and a raised WAF signal rolls nothing back
    new = [await _read_file(client, index, i, r) for i, r in enumerate(refs) if r.obj_id not in done]
    if not refs:
        log.warning("disclosure %s: says it has attachments, the page lists none", index)
        new = [_missing_row("missing")]
    await _settle(conn, index, parsed, new)


async def fetch_attachments_one(
    pool: Any,
    client: KapClient,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
    on_settled: Callable[[int], Awaitable[Any]] | None = None,
    *,
    job_rows: bool = False,
) -> int | None:
    """Process the next due row (live rows, or with `job_rows` the re-fetch job's). None when nothing is due.

    `on_settled(index)` runs after commit for a live row: the disclosure may now go to the agents."""
    async with pool.connection() as conn:
        async with conn.transaction():
            job = await repo.claim_attachments(conn, now(), job_rows=job_rows)
        if job is None:
            return None
        index, attempts = int(job["disclosure_index"]), int(job["attempts"])
        final = attempts >= MAX_ATTEMPTS
        try:
            await _process(conn, client, job, repair_text=job_rows)
        except KapBlockedError as exc:
            async with conn.transaction():
                await repo.fail_attachments(conn, index, str(exc), retry_at=now() + BLOCKED_RETRY)
            raise
        except KapError as exc:
            log.warning(
                "attachments of %s failed (attempt %d%s): %s", index, attempts, ", giving up" if final else "", exc
            )
            if not final:
                async with conn.transaction():
                    await repo.fail_attachments(conn, index, str(exc), retry_at=now() + retry_delay(attempts))
                return index
            await _settle(conn, index, job["parsed"], [_missing_row("download")])
    if on_settled is not None and not job_rows:
        await on_settled(index)
    return index
