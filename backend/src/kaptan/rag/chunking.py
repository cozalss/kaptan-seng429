"""Turkish-aware chunker for KAP disclosure texts (07 §11.1). Pure functions, no I/O.

- Every chunk starts with a contextual header, for the dense and the full-text leg alike:
  `[THYAO | 2025-03-14 | Yeni İş İlişkisi | ODA | kap:1234567]`.
- KAP form boilerplate ("KAMUYU AYDINLATMA PLATFORMU", the KAP link, "Güncelleme mi?" rows …) is
  dropped: every disclosure has it, so it only makes unrelated disclosures look alike.
- A text ≤ `single_max_tokens` is one chunk. Longer texts are packed from paragraph units (form
  lines and table rows are never split) up to `target_tokens`, never above `max_tokens`; the next
  chunk repeats the previous chunk's last unit when it is short (≤ `overlap_max_tokens`, ~15 %).
- Units longer than `max_tokens` are split at sentence ends, and the sentence splitter knows
  Turkish abbreviations ("A.Ş.", "Ltd. Şti.", "vb.", "No.") and numbers ("1.234,56", "16.10.2026").
Token counts are estimates (~3.5 characters per token of Turkish; bge-m3/Gemini tokenise Turkish at
about 1.5–2× English).
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Final

from kaptan.rag.config import ChunkingSpec
from kaptan.text import clean_multiline, norm_key, tr_lower
from kaptan.text.turkish import IST

CHARS_PER_TOKEN: Final = 3.5
_UPPER: Final = "A-ZÇĞİÖŞÜ"
#: A sentence end: . ! ? … followed by space and an upper-case letter, digit, quote or bracket.
_SENTENCE_END: Final = re.compile(rf"(?<=[.!?…])\s+(?=[{_UPPER}0-9\"“'(])")
_ABBREVIATIONS_TEXT: Final = (
    "a.ş aş ltd şti vb vs no nr md mad s sn dr prof doç av tic san inş yat hold müh örn bkz yy tl mah cad "
    "sok bşk gn mdr yrd koop ort tel fax"
)
_ABBREVIATIONS: Final = frozenset(_ABBREVIATIONS_TEXT.split())
_BOILERPLATE_EXACT: Final = frozenset(
    norm_key(s)
    for s in ("KAMUYU AYDINLATMA PLATFORMU", "Özet Bilgi", "İlgili Fonlar []", "İlgili Şirketler []", "Açıklamalar")
)
_BOILERPLATE_PREFIX: Final = tuple(
    norm_key(s)
    for s in (
        "KAP'ta yayınlanma tarihi ve saati",
        "Yapılan Açıklama Güncelleme mi",
        "Yapılan Açıklama Düzeltme mi",
        "Yapılan Açıklama Ertelenmiş",
        "Yapılan açıklama düzeltme mi",
    )
)


@dataclass(frozen=True, slots=True)
class DocMeta:
    """What the contextual header needs (from core.disclosures)."""

    disclosure_index: int
    ticker: str | None
    published_at: datetime
    subject: str
    disclosure_class: str


@dataclass(frozen=True, slots=True)
class Chunk:
    chunk_no: int
    content: str  # header + body: what is embedded and full-text indexed
    token_count: int


def est_tokens(text: str) -> int:
    return max(1, math.ceil(len(text) / CHARS_PER_TOKEN))


def header(meta: DocMeta) -> str:
    day = meta.published_at.astimezone(IST).date().isoformat()
    ticker = meta.ticker or "-"
    return f"[{ticker} | {day} | {meta.subject} | {meta.disclosure_class} | kap:{meta.disclosure_index}]"


def _is_boilerplate(line: str) -> bool:
    key = norm_key(line)
    if not key or key in _BOILERPLATE_EXACT:
        return True
    if line.lstrip().lower().startswith(("http://", "https://")):
        return True
    return key.startswith(_BOILERPLATE_PREFIX)


def clean_body(text: str) -> list[str]:
    """The text's lines without boilerplate (NFC, invisible characters removed, no blank runs)."""
    return [line for line in clean_multiline(text).split("\n") if not _is_boilerplate(line)]


def _ends_with_abbreviation(left: str) -> bool:
    words = left.rstrip().split()
    if not words:
        return False
    last = tr_lower(words[-1]).rstrip(".")
    if last in _ABBREVIATIONS:
        return True
    # "1." list numbers, single-letter initials ("A."), dotted abbreviations ("A.Ş", "T.C")
    return bool(re.fullmatch(r"\d{1,3}|[^\W\d_]|(?:[^\W\d_]\.)+[^\W\d_]", last))


def split_sentences(text: str) -> list[str]:
    """Sentences of one paragraph; Turkish abbreviations and numbers do not end a sentence."""
    pieces = _SENTENCE_END.split(text.strip())
    out: list[str] = []
    for piece in pieces:
        if out and _ends_with_abbreviation(out[-1]):
            out[-1] = f"{out[-1]} {piece}"
        else:
            out.append(piece)
    return [p for p in out if p]


def _hard_split(text: str, max_chars: int) -> Iterator[str]:
    """Word-boundary pieces of at most `max_chars` (a unit without any sentence end)."""
    current: list[str] = []
    size = 0
    for word in text.split():
        if current and size + 1 + len(word) > max_chars:
            yield " ".join(current)
            current, size = [], 0
        current.append(word)
        size += len(word) + (1 if size else 0)
    if current:
        yield " ".join(current)


def units(lines: Sequence[str], max_tokens: int) -> list[str]:
    """Paragraph units ≤ `max_tokens`: a line stays whole when it fits, else sentences, else words."""
    max_chars = int(max_tokens * CHARS_PER_TOKEN)
    out: list[str] = []
    for line in lines:
        if est_tokens(line) <= max_tokens:
            out.append(line)
            continue
        for sentence in split_sentences(line):
            if est_tokens(sentence) <= max_tokens:
                out.append(sentence)
            else:
                out.extend(_hard_split(sentence, max_chars))
    return out


def _pack(parts: Sequence[str], spec: ChunkingSpec, budget: int) -> list[list[str]]:
    groups: list[list[str]] = []
    current: list[str] = []
    size = 0
    for part in parts:
        tokens = est_tokens(part)
        if current and (size + tokens > budget or size >= spec.target_tokens):
            groups.append(current)
            tail = current[-1]
            overlap = len(current) > 1 and est_tokens(tail) <= spec.overlap_max_tokens
            current = [tail] if overlap and est_tokens(tail) + tokens <= budget else []
            size = sum(est_tokens(p) for p in current)
        current.append(part)
        size += tokens
    if current:
        groups.append(current)
    return groups


def chunk_text(meta: DocMeta, text: str, spec: ChunkingSpec) -> list[Chunk]:
    """The chunks of one disclosure text (empty when nothing but boilerplate is left)."""
    lines = clean_body(text)
    if not lines:
        return []
    head = header(meta)
    budget = max(1, spec.max_tokens - est_tokens(head))
    body = "\n".join(lines)
    single = est_tokens(body) <= spec.single_max_tokens
    groups = [lines] if single else _pack(units(lines, budget), spec, budget)
    chunks: list[Chunk] = []
    for no, group in enumerate(groups):
        content = head + "\n" + "\n".join(group)
        chunks.append(Chunk(chunk_no=no, content=content, token_count=est_tokens(content)))
    return chunks


def summary_chunk(meta: DocMeta, summary: str) -> Chunk | None:
    """A header + KAP summary chunk for a disclosure without a fetched text (archive-only subjects)."""
    line = clean_multiline(summary).replace("\n", " ").strip()
    if not line:
        return None
    content = f"{header(meta)}\n{line}"
    return Chunk(chunk_no=0, content=content, token_count=est_tokens(content))


def query_text(subject: str, summary: str, body: str, max_chars: int) -> str:
    """The text a disclosure is searched with: subject, summary and the start of its cleaned body."""
    lines = [subject, summary, *clean_body(body)]
    text = "\n".join(line for line in lines if line.strip())
    return text[:max_chars]
