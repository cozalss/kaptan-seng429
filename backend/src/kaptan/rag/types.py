"""Plain result types of the retriever (no I/O, no heavy imports: the agent context imports them)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Final

from kaptan.text.turkish import IST

MAX_SUBJECT: Final = 64


@dataclass(frozen=True, slots=True)
class SimilarDisclosure:
    """One earlier disclosure the hybrid search found, with the chunk that matched best."""

    disclosure_index: int
    chunk_no: int
    ticker: str | None
    event_type: str | None
    subject: str
    published_at: datetime
    score: float  # reciprocal rank fusion score
    legs: tuple[str, ...]  # which legs found it: dense | fts | trgm
    snippet: str  # untrusted KAP text: never put into a prompt without masking and DATA fencing

    @property
    def ref_id(self) -> str:
        """05 §3.2 `DocChunk.ref_id`: "doc:{disclosure_index}:{chunk_index}"."""
        return f"doc:{self.disclosure_index}:{self.chunk_no}"

    def citation(self) -> str:
        """ "kap:1683372 (2026-10-16)": disclosure index + Istanbul date."""
        return f"kap:{self.disclosure_index} ({self.published_at.astimezone(IST).date().isoformat()})"

    def as_context(self) -> dict[str, Any]:
        """Structured TASK_CONTEXT row (05 §2.3 / §8 L7): ids, dates, codes, no free text."""
        return {
            "ref_id": self.ref_id,
            "disclosure_index": self.disclosure_index,
            "ticker": self.ticker,
            "event_type": self.event_type,
            "kap_subject": self.subject[:MAX_SUBJECT],
            "published_date": self.published_at.astimezone(IST).date().isoformat(),
            "citation": self.citation(),
            "score": round(self.score, 6),
        }
