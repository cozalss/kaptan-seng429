"""Reading an uploaded statement into a table of text cells. Untrusted input: nothing here runs or stores it.

- Size: at most 5 MB, checked on the Content-Length header and again while the body streams in.
- Type: decided from the CONTENT (magic bytes), never from the name or the declared content type. The file name only
  has to agree (csv/tsv/txt for text, xlsx, pdf); anything else is refused. Old `.xls`, macro workbooks (`.xlsm`, any
  zip with a `vbaProject.bin`), `.ods`, images and archives are refused.
- Everything is parsed in memory. XLSX: openpyxl read-only with cached values (formulas are never calculated, macros
  never run, external links not followed, `defusedxml` guards the XML) after a zip-bomb check on the declared
  uncompressed sizes. PDF: pypdf text only (no JavaScript, no embedded files), at most 40 pages, encrypted refused.
  CSV: decoded as UTF-8 or Windows-1254 (Turkish), delimiter chosen by counting, never evaluated.
- Limits: 3000 rows, 30 columns, 100 characters a cell; control characters are removed.
"""

from __future__ import annotations

import csv
import io
import re
import zipfile
from collections.abc import AsyncIterator
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Final

from kaptan.api.errors import ApiError
from kaptan.domain.schemas.imports import MAX_CELL, MAX_COLUMNS, MAX_ROWS, FileKind

MAX_BYTES: Final = 5 * 1024 * 1024
MAX_UNZIPPED: Final = 60 * 1024 * 1024
MAX_ZIP_ENTRIES: Final = 300
MAX_PDF_PAGES: Final = 40
TOO_LARGE: Final = "Dosya 5 MB'tan büyük. Daha küçük bir dönem seç."
UNSUPPORTED: Final = "Bu dosya türünü okuyamıyorum. CSV, XLSX ya da yazısı seçilebilen bir PDF yükle."
OLD_EXCEL: Final = "Eski .xls biçimini okumuyorum. Excel'de 'Farklı kaydet' ile .xlsx yapıp yükle."
MACROS: Final = "Makro içeren Excel dosyalarını açmam. Makrosuz .xlsx olarak kaydedip yükle."
UNREADABLE: Final = "Dosyayı okuyamadım. Bozuk olabilir; bankadan yeniden indirip dene."
EMPTY: Final = "Dosyada okunacak satır bulamadım."
ENCRYPTED: Final = "PDF şifreli. Şifresiz bir kopyasını yükle."
SCANNED: Final = "PDF'te seçilebilir yazı yok (taranmış resim olabilir). CSV ya da Excel olarak indirmeyi dene."

TEXT_EXT: Final = {"csv", "tsv", "txt"}
CONTROL: Final = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
DELIMS: Final = (";", ",", "\t", "|")


async def read_limited(stream: AsyncIterator[bytes], declared: int | None) -> bytes:
    """The body, refused as soon as it passes the limit."""
    if declared is not None and declared > MAX_BYTES:
        raise ApiError(413, "too_large", TOO_LARGE)
    parts: list[bytes] = []
    size = 0
    async for chunk in stream:
        size += len(chunk)
        if size > MAX_BYTES:
            raise ApiError(413, "too_large", TOO_LARGE)
        parts.append(chunk)
    return b"".join(parts)


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def detect(data: bytes, filename: str) -> FileKind:
    """From the bytes; the extension must agree. 415 unsupported_type otherwise."""
    ext = _ext(filename)
    if data.startswith(b"%PDF-"):
        kind: FileKind = "pdf"
    elif data.startswith(b"PK\x03\x04"):
        kind = "xlsx"
    elif data.startswith(b"\xd0\xcf\x11\xe0"):
        raise ApiError(415, "old_excel", OLD_EXCEL)
    elif b"\x00" in data[:8192] or data[:4] in (b"\x89PNG", b"GIF8", b"\xff\xd8\xff\xe0", b"\xff\xd8\xff\xe1"):
        raise ApiError(415, "unsupported_type", UNSUPPORTED)
    else:
        kind = "csv"
    allowed = TEXT_EXT if kind == "csv" else {kind}
    if ext not in allowed:
        raise ApiError(415, "unsupported_type", UNSUPPORTED)
    if not data:
        raise ApiError(422, "empty", EMPTY)
    return kind


def clean(value: object) -> str:
    return CONTROL.sub("", str(value)).replace("\r", " ").replace("\n", " ").strip()[:MAX_CELL]


def _fit(rows: list[list[str]]) -> tuple[list[list[str]], bool]:
    """Empty rows out, columns and rows capped, rows padded to one width."""
    kept = [[clean(c) for c in r[:MAX_COLUMNS]] for r in rows]
    kept = [r for r in kept if any(r)]
    truncated = len(kept) > MAX_ROWS + 1
    kept = kept[: MAX_ROWS + 1]
    width = max((len(r) for r in kept), default=0)
    while width > 0 and not any(len(r) >= width and r[width - 1] for r in kept):
        width -= 1
    return [(r + [""] * width)[:width] for r in kept], truncated


def _text_rows(data: bytes) -> list[list[str]]:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("cp1254", errors="replace")
    head = "\n".join(text.splitlines()[:20])
    delim = max(DELIMS, key=head.count)
    csv.field_size_limit(10_000)
    try:
        return [list(r) for r in csv.reader(io.StringIO(text), delimiter=delim)]
    except csv.Error as err:
        raise ApiError(422, "unreadable", UNREADABLE) from err


def _check_zip(data: bytes) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            infos = z.infolist()
    except zipfile.BadZipFile as err:
        raise ApiError(422, "unreadable", UNREADABLE) from err
    names = {i.filename.lower() for i in infos}
    if any(n.endswith("vbaproject.bin") for n in names):
        raise ApiError(415, "macros", MACROS)
    if "xl/workbook.xml" not in names or len(infos) > MAX_ZIP_ENTRIES or sum(i.file_size for i in infos) > MAX_UNZIPPED:
        raise ApiError(415, "unsupported_type", UNSUPPORTED)


def _xlsx_cell(value: Any) -> str:
    """Numbers in one unambiguous shape (dot decimal, no thousands), dates as ISO, the rest as text."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float | Decimal):
        return format(Decimal(repr(value)) if isinstance(value, float) else Decimal(value), "f")
    if isinstance(value, datetime):
        return value.date().isoformat() if value.time() == time(0) else value.isoformat(timespec="minutes")
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _xlsx_rows(data: bytes) -> list[list[str]]:
    _check_zip(data)
    from openpyxl import load_workbook  # type: ignore[import-untyped]

    try:
        book = load_workbook(io.BytesIO(data), read_only=True, data_only=True, keep_vba=False, keep_links=False)
        try:
            for sheet in book.worksheets:
                rows = [
                    [_xlsx_cell(c) for c in r]
                    for r in sheet.iter_rows(min_row=1, max_row=MAX_ROWS + 50, max_col=MAX_COLUMNS, values_only=True)
                ]
                if any(any(r) for r in rows):
                    return rows
        finally:
            book.close()
    except ApiError:
        raise
    except Exception as err:
        raise ApiError(422, "unreadable", UNREADABLE) from err
    return []


def _pdf_rows(data: bytes) -> list[list[str]]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ApiError(422, "encrypted", ENCRYPTED)
        lines: list[str] = []
        for page in reader.pages[:MAX_PDF_PAGES]:
            lines.extend((page.extract_text() or "").splitlines())
    except ApiError:
        raise
    except Exception as err:
        raise ApiError(422, "unreadable", UNREADABLE) from err
    if not any(line.strip() for line in lines):
        raise ApiError(422, "scanned", SCANNED)
    wide = [re.split(r"\t|\s{2,}", ln.strip()) for ln in lines if ln.strip()]
    if sum(len(r) > 1 for r in wide) * 2 >= len(wide):
        return wide
    return [ln.split() for ln in lines if ln.strip()]


def parse(data: bytes, filename: str) -> tuple[FileKind, list[list[str]], bool]:
    """(kind, rows as text, truncated). Raises ApiError on anything it will not read."""
    kind = detect(data, filename)
    raw = {"csv": _text_rows, "xlsx": _xlsx_rows, "pdf": _pdf_rows}[kind](data)
    rows, truncated = _fit(raw)
    if not rows:
        raise ApiError(422, "empty", EMPTY)
    return kind, rows, truncated
