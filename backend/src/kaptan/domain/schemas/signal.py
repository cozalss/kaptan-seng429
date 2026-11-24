"""Mirror of kaptan-panel/src/lib/domain/signal.ts (one important disclosure: line, tone, so-what, suggestion)."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel, NonNegInt
from kaptan.domain.schemas.reading import TriageStateName

SignalTone = Literal["olumlu", "olumsuz", "notr", "belirsiz"]
SignalMine = Literal["held", "watched"]


class SignalItem(KModel):
    disclosure_index: int = Field(gt=0)
    ticker: str | None
    company_name: str
    published_at: IsoDateTime
    kind: str | None
    important: bool
    mine: SignalMine | None
    line_tr: str
    tone: SignalTone
    so_what_tr: str | None
    suggestion_tr: str | None
    kap_url: str
    panel_path: str
    triage: TriageStateName | None


class SignalList(KModel):
    """The important disclosures of one Istanbul day: `mine_count` of held or watched companies, `other_count` of
    all others. Items: mine first (held, then watched), then the rest, newest first inside each."""

    day: IsoDate
    note: str | None
    mine_count: NonNegInt
    other_count: NonNegInt
    items: list[SignalItem]
