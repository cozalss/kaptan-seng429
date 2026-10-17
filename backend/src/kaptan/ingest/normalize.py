"""KAP list rows → `NormalizedDisclosure` (pure; 07 §3).

Two wire shapes:
- `list/main`: `{"disclosureBasic": {title, mkkMemberOid, companyTitle, stockCode, relatedStocks,
  disclosureClass, disclosureType, disclosureCategory, publishDate, disclosureId, disclosureIndex,
  summary, attachmentCount, year, period, hasMultiLanguageSupport ("Y"/"N"), isLate,
  relatedDisclosureOid, isChanged, …}, "disclosureDetail": {relatedDisclosureIndex, …}}`
- `members/byCriteria`: flat `{publishDate, kapTitle, disclosureClass, disclosureType, disclosureCategory,
  summary, subject, relatedStocks, year, ruleType, period, disclosureIndex, isLate, stockCodes,
  hasMultiLanguageSupport (bool), attachmentCount, modifyStatus}` (no OID, no member OID).

Times: `publishDate` is Istanbul local → UTC. `first_seen_at` = our wall clock for live rows, NULL for
backfill; `available_at` = max(first_seen_at, published_at) live, published_at + 60 s backfill (P1).
Tickers are ASCII upper case and must match the panel's `^[A-Z0-9]{3,6}$`; others stay in `raw` only.
KAP-sent notices (circuit breaker, MKK-forwarded insider trades) have no `stockCode`: the subject
company is the first of `relatedStocks`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from typing import Any, Final, Literal

from kaptan.ingest.subject_routes import SUBJECT_MAP_VERSION, route_for
from kaptan.text.turkish import clean_text, parse_kap_datetime

IngestSource = Literal["live", "backfill", "reconcile"]

CLASSES: Final = frozenset({"ODA", "FR", "DG", "DKB", "DUY"})
TICKER_RE: Final = re.compile(r"^[A-Z0-9]{3,6}$")
BACKFILL_DELAY: Final = timedelta(seconds=60)


class RowError(ValueError):
    """A list row that cannot be stored (logged and skipped, never silently)."""


@dataclass(frozen=True, slots=True)
class NormalizedDisclosure:
    disclosure_index: int
    disclosure_oid: str | None
    member_oid: str | None
    stock_codes: tuple[str, ...]
    related_stocks: tuple[str, ...]
    primary_ticker: str | None
    company_name: str
    disclosure_class: str
    disclosure_type: str
    disclosure_category: str | None
    subject: str
    summary: str
    reason: str
    related_index: int | None
    is_late: bool
    fin_year: int | None
    fin_period: str | None
    attachment_count: int
    has_multilang: bool
    subject_route: str
    published_at: datetime
    first_seen_at: datetime | None
    available_at: datetime
    ingest_source: IngestSource
    raw: dict[str, Any] = field(repr=False, compare=False)
    subject_map_version: str = SUBJECT_MAP_VERSION

    @property
    def is_noise(self) -> bool:
        return self.subject_route == "noise"

    def with_company(self, company_name: str) -> NormalizedDisclosure:
        return replace(self, company_name=company_name)


def split_codes(value: Any) -> tuple[str, ...]:
    """'ISMEN, IYM' / ['AHSGY', 'RE8'] → ('ISMEN', 'IYM'); invalid codes are dropped, order kept."""
    if value is None:
        return ()
    parts = value if isinstance(value, list) else str(value).replace(";", ",").split(",")
    out: list[str] = []
    for part in parts:
        code = clean_text(str(part)).upper()
        if TICKER_RE.fullmatch(code) and code not in out:
            out.append(code)
    return tuple(out)


def _bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().upper() in {"Y", "TRUE", "1", "EVET", "E"}


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value) if value not in (None, "", "-") else None
    except (TypeError, ValueError):
        return None


def _text_or_none(value: Any) -> str | None:
    text = clean_text(str(value)) if value is not None else ""
    return text if text and text != "-" else None


def _times(
    published_local: str, source: IngestSource, seen_at: datetime | None
) -> tuple[datetime, datetime | None, datetime]:
    published = parse_kap_datetime(published_local).astimezone(UTC)
    if source == "backfill" or seen_at is None:
        return published, None, published + BACKFILL_DELAY
    seen = seen_at.astimezone(UTC)
    return published, seen, max(seen, published)


def _common(
    *,
    index: Any,
    klass: Any,
    subject: Any,
    stock_codes: Any,
    related: Any,
    published: Any,
    source: IngestSource,
    seen_at: datetime | None,
) -> dict[str, Any]:
    idx = _int_or_none(index)
    if idx is None or idx <= 0:
        raise RowError(f"bad disclosureIndex: {index!r}")
    disclosure_class = clean_text(str(klass or "")).upper()
    if disclosure_class not in CLASSES:
        raise RowError(f"{idx}: unknown disclosureClass {klass!r}")
    subj = clean_text(str(subject or ""))
    if not subj:
        raise RowError(f"{idx}: empty subject")
    if not published:
        raise RowError(f"{idx}: no publishDate")
    try:
        published_at, first_seen_at, available_at = _times(str(published), source, seen_at)
    except ValueError as exc:
        raise RowError(f"{idx}: {exc}") from exc
    codes, related_codes = split_codes(stock_codes), split_codes(related)
    primary = codes[0] if codes else (related_codes[0] if related_codes else None)
    return {
        "disclosure_index": idx,
        "disclosure_class": disclosure_class,
        "subject": subj,
        "subject_route": route_for(subj),
        "stock_codes": codes,
        "related_stocks": related_codes,
        "primary_ticker": primary,
        "published_at": published_at,
        "first_seen_at": first_seen_at,
        "available_at": available_at,
        "ingest_source": source,
    }


def from_list_main(item: dict[str, Any], *, source: IngestSource, seen_at: datetime | None) -> NormalizedDisclosure:
    basic = item.get("disclosureBasic")
    if not isinstance(basic, dict):
        raise RowError("list/main row without disclosureBasic")
    detail = item.get("disclosureDetail") if isinstance(item.get("disclosureDetail"), dict) else {}
    assert isinstance(detail, dict)
    common = _common(
        index=basic.get("disclosureIndex"),
        klass=basic.get("disclosureClass"),
        subject=basic.get("title"),
        stock_codes=basic.get("stockCode"),
        related=basic.get("relatedStocks"),
        published=basic.get("publishDate"),
        source=source,
        seen_at=seen_at,
    )
    related_index = _int_or_none(detail.get("relatedDisclosureIndex"))
    return NormalizedDisclosure(
        **common,
        disclosure_oid=_text_or_none(basic.get("disclosureId")),
        member_oid=_text_or_none(basic.get("mkkMemberOid")),
        company_name=clean_text(str(basic.get("companyTitle") or "")),
        disclosure_type=clean_text(str(basic.get("disclosureType") or common["disclosure_class"])),
        disclosure_category=_text_or_none(basic.get("disclosureCategory")),
        summary=clean_text(str(basic.get("summary") or "")),
        # list rows carry no NEW/UPD/CORR flag; a link to an earlier disclosure means an update.
        # The detail text ("Güncelleme mi?/Düzeltme mi?") refines it later.
        reason="UPD" if basic.get("relatedDisclosureOid") or related_index else "NEW",
        related_index=related_index if related_index and related_index > 0 else None,
        is_late=_bool(basic.get("isLate")),
        fin_year=_int_or_none(basic.get("year")),
        fin_period=_text_or_none(basic.get("period")),
        attachment_count=max(0, _int_or_none(basic.get("attachmentCount")) or 0),
        has_multilang=_bool(basic.get("hasMultiLanguageSupport")),
        raw=item,
    )


def from_by_criteria(row: dict[str, Any], *, source: IngestSource, seen_at: datetime | None) -> NormalizedDisclosure:
    common = _common(
        index=row.get("disclosureIndex"),
        klass=row.get("disclosureClass"),
        subject=row.get("subject"),
        stock_codes=row.get("stockCodes"),
        related=row.get("relatedStocks"),
        published=row.get("publishDate"),
        source=source,
        seen_at=seen_at,
    )
    return NormalizedDisclosure(
        **common,
        disclosure_oid=None,
        member_oid=None,
        company_name=clean_text(str(row.get("kapTitle") or "")),
        disclosure_type=clean_text(str(row.get("disclosureType") or common["disclosure_class"])),
        disclosure_category=_text_or_none(row.get("disclosureCategory")),
        summary=clean_text(str(row.get("summary") or "")),
        reason="NEW",
        related_index=None,
        is_late=_bool(row.get("isLate")),
        fin_year=_int_or_none(row.get("year")),
        fin_period=_text_or_none(row.get("period")) or _text_or_none(row.get("ruleType")),
        attachment_count=max(0, _int_or_none(row.get("attachmentCount")) or 0),
        has_multilang=_bool(row.get("hasMultiLanguageSupport")),
        raw=row,
    )


def normalize_rows(
    rows: list[dict[str, Any]], *, source: IngestSource, seen_at: datetime | None
) -> tuple[list[NormalizedDisclosure], list[str]]:
    """Both shapes; returns (rows sorted by index and deduplicated, errors). Never raises on one bad row."""
    out: dict[int, NormalizedDisclosure] = {}
    errors: list[str] = []
    for row in rows:
        try:
            fn = from_list_main if "disclosureBasic" in row else from_by_criteria
            d = fn(row, source=source, seen_at=seen_at)
        except RowError as exc:
            errors.append(str(exc))
            continue
        out.setdefault(d.disclosure_index, d)
    return [out[k] for k in sorted(out)], errors
