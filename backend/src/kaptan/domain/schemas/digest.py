"""Mirror of kaptan-panel/src/lib/domain/digest.ts (the day's important disclosures)."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from kaptan.domain.schemas._base import IsoDate, IsoDateTime, KModel, Ticker

DigestKind = Literal["restriction", "insider", "contract", "earnings", "dividend", "capital", "merger", "buyback"]


class DigestItem(KModel):
    disclosure_index: int = Field(gt=0)
    kind: DigestKind
    ticker: Ticker
    company_name: str
    line: str
    headline: str | None
    published_at: IsoDateTime
    source_url: str
    why: Literal["held", "watched"] | None
    outside_list: bool
    outside_note: str | None
    tone: Literal["olumlu", "olumsuz", "notr", "belirsiz"]
    so_what_tr: str | None
    suggestion_tr: str | None
    panel_path: str


class DigestKindCount(KModel):
    kind: DigestKind
    title: str
    count: int = Field(gt=0)


class Digest(KModel):
    day: IsoDate
    is_trading_day: bool
    note: str | None
    prev_day: IsoDate
    next_day: IsoDate | None
    total: int = Field(ge=0)
    truncated: bool
    kinds: list[DigestKindCount]
    items: list[DigestItem]
