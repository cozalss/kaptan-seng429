"""Type-specific parsers for KAP detail texts (07 §5.1, Rev. 3): chosen by `subject`, input = the
cleaned BildirimPdf text. Each returns a JSON-able document with `kind`, `status` (ok | partial |
attachment_only | failed) and the update/correction flags; `parse_detail` adds `parser_version`.

    doc = parse_detail("Payların Geri Alınmasına İlişkin Bildirim", text)   # None: no parser for it
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, Final

from kaptan.ingest.parsers import buyback, contracts, financials, insider
from kaptan.ingest.parsers.common import flags, jsonable, section
from kaptan.text.turkish import clean_text, norm_key

PARSER_VERSION: Final = "kap-parsers.v1"
_GENERAL_END: Final = ("Yukarıdaki açıklamalarımızın",)


def parse_general(text: str) -> dict[str, Any]:
    """Free-text ÖDA: the flags and the explanation body (the Classifier reads it)."""
    body = clean_text(section(text, "Açıklamalar", *_GENERAL_END))
    return {"kind": "general", **flags(text), "explanation": body or None, "status": "ok" if body else "partial"}


Parser = Callable[[str], dict[str, Any]]

_BY_SUBJECT: Final[dict[str, Parser]] = {
    norm_key(subject): fn
    for subject, fn in (
        ("Payların Geri Alınmasına İlişkin Bildirim", buyback.parse),
        ("Pay Alım Satım Bildirimi", insider.parse),
        ("Yeni İş İlişkisi", contracts.parse_new_business),
        ("İhale Süreci / Sonucu", contracts.parse_tender),
        ("Finansal Rapor", financials.parse),
        ("Özel Durum Açıklaması (Genel)", parse_general),
        ("Haber ve Söylentilere İlişkin Açıklama", parse_general),
    )
}


def parser_for(subject: str) -> Parser | None:
    return _BY_SUBJECT.get(norm_key(subject))


def parse_detail(subject: str, text: str) -> dict[str, Any] | None:
    """The parsed document (JSON-able) or None when the subject has no parser. Never raises on bad text."""
    fn = parser_for(subject)
    if fn is None:
        return None
    try:
        doc = fn(text)
    except Exception as exc:  # a parser bug must not stop ingestion; recorded as a DQ failure
        doc = {"kind": "error", "status": "failed", "error": f"{type(exc).__name__}: {exc}"[:300]}
    result: dict[str, Any] = jsonable({**doc, "parser_version": PARSER_VERSION})
    return result


__all__ = ["PARSER_VERSION", "parse_detail", "parser_for"]
