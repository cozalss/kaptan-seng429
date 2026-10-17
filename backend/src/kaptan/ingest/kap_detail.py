"""Full text of one disclosure (07 §5): BildirimPdf first, the /tr/Bildirim RSC page as fallback.

- `GET /tr/api/BildirimPdf/{idx}` is a PDF (iText) of the whole form: labels and table headers come out
  as ordered text lines → the primary source for the type-specific parsers (`source='bildirim_pdf'`).
- `GET /tr/Bildirim/{idx}` is a Next.js page; the form HTML sits in `self.__next_f.push([1,"…"])` RSC
  chunks. TR and EN cells carry `content-tr` / `content-en` classes; the ÖDA free-text block follows the
  `oda_ExplanationTextBlock|` marker (not present in every type) (`source='rsc_payload'`).

Both are cleaned (NFC, invisible characters, whitespace; line breaks kept) before storage. The legally
binding text is Turkish; English is kept as a separate row when the page has it.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import re
from dataclasses import dataclass
from typing import Final, Literal

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from kaptan.ingest.kap_client import KapBlockedError, KapClient, KapError
from kaptan.text.turkish import clean_multiline, strip_html

log = logging.getLogger("kaptan.ingest.detail")

EXTRACTOR_VERSION: Final = "kap-detail.v1"
MAX_PDF_BYTES: Final = 20 * 1024 * 1024
RSC_RE: Final = re.compile(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', re.S)
ODA_MARK: Final = "oda_ExplanationTextBlock|"
_EN_CELL: Final = re.compile(r'<(td|div)[^>]*class="[^"]*\bcontent-en\b[^"]*"[^>]*>.*?</\1>', re.S)
_TR_BLOCK: Final = re.compile(r'<td[^>]*class="[^"]*\bcontent-tr\b[^"]*"[^>]*>(.*?)</td>', re.S)
_EN_BLOCK: Final = re.compile(r'<td[^>]*class="[^"]*\bcontent-en\b[^"]*"[^>]*>(.*?)</td>', re.S)

Source = Literal["bildirim_pdf", "rsc_payload"]


class DetailError(KapError):
    """Neither source gave usable text."""


@dataclass(frozen=True, slots=True)
class DetailText:
    disclosure_index: int
    texts: dict[str, str]  # lang → cleaned body ("tr" always present)
    source: Source
    payload_sha256: bytes
    extractor_version: str = EXTRACTOR_VERSION

    @property
    def tr(self) -> str:
        return self.texts["tr"]


def pdf_to_text(data: bytes) -> str:
    """PDF bytes → cleaned text, pages in order. Raises DetailError on a broken or oversized PDF."""
    if len(data) > MAX_PDF_BYTES:
        raise DetailError(f"PDF too large ({len(data)} bytes)")
    try:
        reader = PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
    except (PdfReadError, ValueError, KeyError, TypeError) as exc:
        raise DetailError(f"unreadable PDF: {type(exc).__name__}") from exc
    return clean_multiline("\n".join(pages))


def rsc_payload(page: str) -> str:
    """The concatenated RSC string chunks of a /tr/Bildirim page ('' when there are none)."""
    out: list[str] = []
    for chunk in RSC_RE.findall(page):
        try:
            out.append(json.loads(f'"{chunk}"'))
        except json.JSONDecodeError:
            continue
    return "".join(out)


def rsc_texts(payload: str) -> dict[str, str]:
    """{"tr": …, "en": …?}. ÖDA free text when the marker exists, else the whole form (TR cells only)."""
    i = payload.find(ODA_MARK)
    if i >= 0:
        block = payload[i + len(ODA_MARK) :]
        tr = _TR_BLOCK.search(block)
        en = _EN_BLOCK.search(block)
        texts = {"tr": strip_html(tr.group(1)) if tr else ""}
        if en and strip_html(en.group(1)):
            texts["en"] = strip_html(en.group(1))
        if texts["tr"]:
            return texts
    return {"tr": strip_html(_EN_CELL.sub(" ", payload))}


def _sha(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


async def fetch_detail(client: KapClient, disclosure_index: int) -> DetailText:
    """BildirimPdf → text; on a non-WAF failure or an empty text, the RSC page. KapBlockedError propagates."""
    reason = ""
    try:
        data = await client.bildirim_pdf(disclosure_index)
        text = pdf_to_text(data)
        if text:
            return DetailText(disclosure_index, {"tr": text}, "bildirim_pdf", _sha(data))
        reason = "empty PDF text"
    except KapBlockedError:
        raise
    except KapError as exc:
        reason = str(exc)
    log.info("detail %s: BildirimPdf unusable (%s); trying /tr/Bildirim", disclosure_index, reason)
    page = await client.bildirim_html(disclosure_index)
    payload = rsc_payload(page)
    texts = rsc_texts(payload) if payload else {"tr": ""}
    if not texts.get("tr"):
        raise DetailError(f"{disclosure_index}: no text in BildirimPdf or the RSC page")
    return DetailText(disclosure_index, texts, "rsc_payload", _sha(payload.encode("utf-8")))
