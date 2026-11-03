"""A disclosure's attachment files: how KAP lists them, what the bytes are, and the text the Reader gets (05 §1.4).

- The `/tr/Bildirim/{idx}` page lists them in its RSC payload: `"attachments":[{"objId","fileName","fileExtension"}]`.
- `GET /tr/api/file/download/{objId}` answers with a **Java-serialised `byte[]`**, not the file: a fixed 23-byte
  header, a 4-byte length, then the file. We strip that exact header; nothing is ever deserialised.
- PDFs are read with pypdf's layout mode: plain mode returns the fields of MKK's form out of order.

Attachment text is untrusted third-party data, like the body: it goes into the same fenced DATA block, through
the same guard and masking. Contact details are dropped here, before storage (09 §9.2 data minimisation). A file
that cannot be read gets a reason in plain Turkish; nothing downstream guesses what it said.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Final, Literal

from pypdf import PdfReader

from kaptan.ingest.kap_detail import DetailError, rsc_payload
from kaptan.text.turkish import clean_multiline, decode_bytes, strip_html, tr_lower

log = logging.getLogger("kaptan.ingest.attachments")

EXTRACTOR_VERSION: Final = "kap-attachment.v1"
MAX_ATTACHMENT_BYTES: Final = 10 * 1024 * 1024
MAX_PAGES: Final = 10  # 05 §1.6 get_attachment_text
MAX_TEXT_CHARS: Final = 12_000  # the Reader's budget is ≈ 8K tokens for the whole disclosure
MIN_TEXT_CHARS: Final = 40  # less than this on every page is a scan or a blank page, not a document
MAX_FILES: Final = 3

_JAVA_STREAM: Final = b"\xac\xed\x00\x05"
_JAVA_BYTE_ARRAY: Final = bytes.fromhex("aced0005757200025b42acf317f8060854e00200007870")
_OBJ_ID: Final = re.compile(r"^[0-9A-Za-z]{16,64}$")
_LIST_KEY: Final = '"attachments":['
_CONTACT_LINE: Final = re.compile(
    r"^[ \t]*(?:Adres|Address|Telefon|Tel|Faks|Fax|Phone|E-?posta|E-?mail|İmza|Signature)\b[^\n:]*:[^\n]*\n?",
    re.I | re.M,
)
_EMAIL: Final = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE: Final = re.compile(r"\+\d[\d\s()/-]{6,}\d")
_TR_WORDS: Final = ("tarihinde", "işlem", "pay", "oran", "fiyat")
_EN_WORDS: Final = ("transaction", "shares", "company", "ratio", "nominal value")

UnreadableReason = Literal["scanned", "empty", "encrypted", "broken", "unsupported", "too_large", "timeout", "download"]
REASONS_TR: Final[dict[str, str]] = {
    "scanned": "Ek taranmış görüntü; metni okunamadı.",
    "empty": "Ek boş; içinde okunacak metin yok.",
    "encrypted": "Ek şifreli; açılamadı.",
    "broken": "Ek dosyası bozuk; açılamadı.",
    "too_large": "Ek dosyası çok büyük; okunmadı.",
    "timeout": "Ek zamanında okunamadı.",
    "download": "Ek KAP'tan indirilemedi.",
    "missing": "Ek bildirim sayfasında bulunamadı.",
}


@dataclass(frozen=True, slots=True)
class AttachmentRef:
    obj_id: str
    file_name: str
    file_ext: str


@dataclass(frozen=True, slots=True)
class ExtractedFile:
    status: Literal["read", "unreadable"]
    text: str = ""
    reason: str | None = None
    reason_tr: str | None = None
    pages: int | None = None
    lang: str = "tr"
    n_bytes: int = 0
    payload_sha256: bytes | None = None


@dataclass(frozen=True, slots=True)
class StoredAttachment:
    """What the Reader's text is composed from (one row of core.disclosure_attachments)."""

    status: str
    reason_tr: str | None
    body: str
    lang: str = "tr"


def unreadable(reason: str, *, detail: str | None = None, n_bytes: int = 0) -> ExtractedFile:
    return ExtractedFile("unreadable", reason=reason, reason_tr=detail or REASONS_TR[reason], n_bytes=n_bytes)


# ── the page's list ──────────────────────────────────────────────────────
def page_attachments(page: str) -> list[AttachmentRef]:
    """The attachments a /tr/Bildirim page lists. An id that does not look like KAP's is dropped: it goes in a URL."""
    payload = rsc_payload(page)
    start = payload.find(_LIST_KEY)
    if start < 0:
        return []
    try:
        items, _end = json.JSONDecoder().raw_decode(payload, start + len(_LIST_KEY) - 1)
    except json.JSONDecodeError:
        log.warning("attachment list is not JSON")
        return []
    refs = (
        AttachmentRef(
            str(i.get("objId") or ""), str(i.get("fileName") or ""), str(i.get("fileExtension") or "").lower()
        )
        for i in items
        if isinstance(i, dict)
    )
    return [r for r in refs if _OBJ_ID.match(r.obj_id)]


# ── the bytes ────────────────────────────────────────────────────────────
def unwrap_download(data: bytes) -> bytes:
    """The file inside KAP's download answer. Only the exact byte[] header is accepted; no deserialisation."""
    if not data.startswith(_JAVA_STREAM):
        return data
    if not data.startswith(_JAVA_BYTE_ARRAY):
        raise DetailError("download is a Java object that is not a byte array")
    head = len(_JAVA_BYTE_ARRAY) + 4
    declared = int.from_bytes(data[len(_JAVA_BYTE_ARRAY) : head], "big")
    if declared != len(data) - head:
        raise DetailError(f"download truncated ({len(data) - head} of {declared} bytes)")
    return data[head:]


def redact_contacts(text: str) -> str:
    """Addresses, phones, e-mails and signature lines: the Reader needs none of them (09 §9.2)."""
    without_lines = _CONTACT_LINE.sub("", text)
    return _PHONE.sub("[telefon]", _EMAIL.sub("[e-posta]", without_lines))


def clean_extracted(text: str) -> str:
    """Raw extractor output → stored text: normalised, contact details gone. The table parser needs all of it."""
    return redact_contacts(clean_multiline(text))


def _language(text: str) -> str:
    low = tr_lower(text)
    tr_score = sum(word in low for word in _TR_WORDS)
    en_score = sum(word in low for word in _EN_WORDS)
    return "en" if en_score > tr_score else "tr"


def _page_text(page: object) -> str:
    try:
        return str(page.extract_text(extraction_mode="layout") or "")  # type: ignore[attr-defined]
    except Exception:  # layout mode is pickier than plain mode on odd fonts
        return str(page.extract_text() or "")  # type: ignore[attr-defined]


def _has_images(page: object) -> bool:
    resources = page.get("/Resources")  # type: ignore[attr-defined]
    return resources is not None and "/XObject" in resources.get_object()


def _read_pdf(data: bytes) -> ExtractedFile:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            return unreadable("encrypted")
        pages = list(reader.pages)
        if len(pages) > MAX_PAGES:  # half a table would still add up: a file this long is not read at all
            return unreadable("too_large")
        text = clean_extracted("\n".join(_page_text(p) for p in pages))
        images = any(_has_images(p) for p in pages)
    except Exception as exc:  # a damaged or hostile file can fail anywhere inside the parser: it is simply unreadable
        log.info("attachment unreadable: %s", type(exc).__name__)
        return unreadable("broken")
    if len(text) < MIN_TEXT_CHARS:
        return unreadable("scanned" if images else "empty")
    return ExtractedFile("read", text=text, pages=len(pages), lang=_language(text))


def extract_attachment(ref: AttachmentRef, data: bytes) -> ExtractedFile:
    """One downloaded file → text or an honest reason. Never raises on bad content."""
    n_bytes = len(data)
    if n_bytes > MAX_ATTACHMENT_BYTES:
        return unreadable("too_large", n_bytes=n_bytes)
    try:
        content = unwrap_download(data)
    except DetailError as exc:
        log.info("attachment %s: %s", ref.obj_id, exc)
        return unreadable("broken", n_bytes=n_bytes)
    ext = ref.file_ext.lower()
    if ext == "pdf" or content.startswith(b"%PDF"):
        got = _read_pdf(content)
    elif ext in ("html", "htm"):
        text = clean_extracted(strip_html(decode_bytes(content)[0]))
        got = (
            ExtractedFile("read", text=text, pages=1, lang=_language(text))
            if len(text) >= MIN_TEXT_CHARS
            else unreadable("empty")
        )
    else:
        got = unreadable("unsupported", detail=f"Ek biçimi desteklenmiyor ({ext or 'bilinmiyor'}); okunmadı.")
    return ExtractedFile(
        status=got.status,
        text=got.text,
        reason=got.reason,
        reason_tr=got.reason_tr,
        pages=got.pages,
        lang=got.lang,
        n_bytes=n_bytes,
        payload_sha256=hashlib.sha256(content).digest(),
    )


# ── the Reader's text ────────────────────────────────────────────────────
def _neutralise(text: str) -> str:
    """A file cannot write our markers: they open with a bracket only when this module writes them."""
    for marker in ("/EK BELGE", "EK BELGE", "EK OKUNAMADI"):
        text = text.replace(f"[{marker}", f"({marker}")
    return text


def _readers_files(files: Sequence[StoredAttachment]) -> list[StoredAttachment]:
    """An English copy adds nothing when a Turkish file was read (the Turkish text is the binding one)."""
    has_turkish = any(f.status == "read" and f.lang == "tr" for f in files)
    return [f for f in files if not (has_turkish and f.status == "read" and f.lang == "en")]


def compose_text(body: str, files: Sequence[StoredAttachment]) -> str:
    """Body + one marked block per attachment: this is `text_tr`, so the guard, masking and fence all cover it."""
    kept = _readers_files(files)
    parts = [body] if body else []
    for n, f in enumerate(kept, start=1):
        label = f"{n}/{len(kept)}"
        if f.status == "read":
            text = _neutralise(f.body)[:MAX_TEXT_CHARS]
            parts.append(f"[EK BELGE {label}: bildirime eklenen dosya, üçüncü taraf metni]\n{text}\n[/EK BELGE]")
        else:
            parts.append(f"[EK OKUNAMADI {label}: {f.reason_tr or 'Ek okunamadı.'}]")
    return "\n\n".join(parts)


def with_attachment_text(texts: Sequence[Mapping[str, str]], files: Sequence[StoredAttachment]) -> list[dict[str, str]]:
    """The run's text rows with the attachments added to the Turkish one (new rows; the stored body is not changed)."""
    rows = [dict(t) for t in texts]
    if not files:
        return rows
    for row in rows:
        if row["lang"] == "tr":
            row["body"] = compose_text(row["body"], files)
            return rows
    return [{"lang": "tr", "body": compose_text("", files)}, *rows]
