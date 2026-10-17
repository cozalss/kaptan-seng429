"""Mirror of kaptan-panel/src/lib/domain/disclosure.ts."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from kaptan.domain.schemas._base import Confidence, IsoDateTime, KModel, NonNegInt, PosInt, Ticker
from kaptan.domain.schemas.common import EventType

DisclosureClass = Literal["ODA", "FR", "DG", "DKB", "DUY"]
DisclosureReason = Literal["NEW", "UPD", "CORR", "CANC"]
#: noise | E1..E4 | llm | archive_only | avoid:<name>
SubjectRoute = Annotated[str, Field(pattern=r"^(noise|E1|E2|E3|E4|llm|archive_only|avoid:[a-z_]+)$")]
IngestSource = Literal["live", "backfill", "reconcile", "demo"]


class Disclosure(KModel):
    disclosure_index: PosInt
    disclosure_oid: str
    stock_codes: list[Ticker]
    related_stocks: list[Ticker]
    primary_ticker: Ticker | None
    company_name: str
    disclosure_class: DisclosureClass
    disclosure_type: str
    subject: str
    summary: str
    reason: DisclosureReason
    related_index: PosInt | None
    is_late: bool
    attachment_count: NonNegInt
    has_multilang: bool
    is_noise: bool
    subject_route: SubjectRoute
    subject_map_version: str
    published_at: IsoDateTime
    first_seen_at: IsoDateTime
    available_at: IsoDateTime
    ingest_source: IngestSource


class Classification(KModel):
    event_type: EventType
    confidence: Confidence
    method: Literal["subject_map", "llm"]


class DisclosureListItem(Disclosure):
    classification: Classification | None
    run_id: str | None
    linked_news_count: NonNegInt
    note_count: NonNegInt


class DisclosureText(KModel):
    lang: Literal["tr", "en"]
    body: str


class Note(KModel):
    id: str
    disclosure_index: PosInt
    author: str
    body: str = Field(min_length=1, max_length=1000)
    created_at: IsoDateTime


class DisclosureDetail(DisclosureListItem):
    texts: list[DisclosureText]
    notes: list[Note]


class DayCounters(KModel):
    """Live counters for "today" (US-43)."""

    as_of: IsoDateTime
    total: NonNegInt
    noise: NonNegInt
    archived: NonNegInt
    processed: NonNegInt
    e_candidates: NonNegInt
    proposals: NonNegInt
    approvals: NonNegInt
    rejections: NonNegInt
    llm_calls: NonNegInt
    llm_tokens: NonNegInt
