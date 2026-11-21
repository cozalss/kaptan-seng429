"""Statement import (POST /me/import/read|preview|apply, GET /me/import/sources).

Mirrors kaptan-panel/src/lib/domain/imports.ts. Money is TL as JSON numbers, dates `YYYY-MM-DD`.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from kaptan.domain.schemas._base import IsoDate, KModel

MAX_ROWS = 3000
MAX_COLUMNS = 30
MAX_CELL = 100
MAX_SOURCE = 40

SourceName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_SOURCE,
        pattern=r"^[0-9A-Za-zÇĞİÖŞÜçğıöşü][0-9A-Za-zÇĞİÖŞÜçğıöşü .\-]*$",
    ),
]
Cell = Annotated[str, StringConstraints(max_length=MAX_CELL)]
ImportKind = Literal["buy", "sell", "deposit", "withdrawal", "dividend"]
TypeChoice = Literal["buy", "sell", "deposit", "withdrawal", "dividend", "skip"]
FileKind = Literal["csv", "xlsx", "pdf"]
NumberStyle = Literal["auto", "dot"]
RowStatus = Literal["new", "recorded", "conflict", "invalid", "skipped"]
Column = Annotated[int, Field(ge=0, lt=MAX_COLUMNS)]


class ImportMapping(KModel):
    """Which column holds what. `types` maps a type word of the file (as `type_key` writes it) to what it is."""

    has_header: bool
    date: Column | None = None
    type: Column | None = None
    fixed_kind: ImportKind | None = None
    ticker: Column | None = None
    qty: Column | None = None
    price: Column | None = None
    commission: Column | None = None
    amount: Column | None = None
    types: dict[Annotated[str, StringConstraints(max_length=60)], TypeChoice] = Field(
        default_factory=dict, max_length=200
    )


class ImportTable(KModel):
    """What the file said, as text cells: the person maps the columns on top of it. Nothing is stored."""

    file_kind: FileKind
    number_style: NumberStyle
    columns: int
    rows: list[list[Cell]]
    truncated: bool
    has_header_guess: bool
    saved_mapping: ImportMapping | None
    saved_matches: bool


class ImportRequest(KModel):
    source: SourceName
    mapping: ImportMapping
    number_style: NumberStyle = "auto"
    rows: list[Annotated[list[Cell], Field(max_length=MAX_COLUMNS)]] = Field(max_length=MAX_ROWS + 1)


class ImportApplyRequest(ImportRequest):
    """`selected`: the row indexes (of `rows`) the person ticked; rows not new are ignored."""

    selected: list[int] = Field(max_length=MAX_ROWS + 1)


class ImportRow(KModel):
    index: int
    date: IsoDate | None
    kind: ImportKind | None
    ticker: str | None
    qty: int | None
    price: float | None
    commission_try: float | None
    amount_try: float | None
    status: RowStatus
    reason: str


class ImportPreview(KModel):
    rows: list[ImportRow]
    new: int
    recorded: int
    conflict: int
    invalid: int
    skipped: int
    unknown_types: list[str]
    started: bool


class ImportResult(KModel):
    written: int
    failed: list[ImportRow]
    preview: ImportPreview


class ImportSources(KModel):
    sources: list[str]
