"""Parsing SPK tedbir / BIST VBTS / trading-halt notices into restriction measures (06 R04, U7). Pure.

Input is one KAP disclosure as stored (subject, summary, codes, available_at, optionally its TR text).
Matching is on `join_key` (Turkish lower case without diacritics), so "BRÜT TAKAS" = "brut takas".

- route `avoid:spk_tedbir` / subject "Sermaye Piyasası Kurulu Tedbir Kararı" → `spk_tedbir` (no end
  unless the text gives one);
- a VBTS / BIST measure ("brüt takas", "açığa satış", "kredili işlem", "tek fiyat", "emir paketi") →
  `vbts_*` (`other` for emir paketi); a VBTS notice of no recognisable type → `vbts_brut_takas`, flagged
  `kind_inferred` (an unknown measure still blocks a buy, 06 R04);
- "işlem sırasının durdurulması" / "işlemlerin durdurulması" (not the circuit breaker) → `trading_halt`,
  open until a lift;
- "… açılması", "yeniden başlatılması", "tedbirin kaldırılması / sona ermesi" → a *lift*: it closes the
  ticker's open measure(s) of that kind.

Dates: "dd.mm.yyyy tarihinden itibaren" (start), "… tarihine kadar" / a "dd.mm.yyyy - dd.mm.yyyy" range
(end), "N ay/gün/iş günü/seans/hafta/yıl süreyle" (duration); a VBTS measure without any of them lasts
`VBTS_DEFAULT_MONTHS` [V]: every VBTS stage lasts "1 ay" since 15/11/2021 (was 15 gün), and a later stage
extends the earlier ones to its own end (Borsa İstanbul KAP notice, https://kap.org.tr/tr/api/BildirimPdf/976897,
item 4; accessed 2026-10-29; the 08/07/2026–07/08/2026 KGYO/PASEU/MARKA/SAFKR notice matches). The start
defaults to the Istanbul date the notice became available (earlier = more conservative for a veto).
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any, Final, Literal

from kaptan.prices.calendar import IST, CalendarRangeError, add_sessions, istanbul_date
from kaptan.reference.profiles import affected_codes
from kaptan.text.turkish import clean_text, join_key, tr_lower

Kind = Literal[
    "spk_tedbir", "vbts_brut_takas", "vbts_aciga_satis", "vbts_kredili_islem", "vbts_tek_fiyat", "trading_halt", "other"
]
VBTS_DEFAULT_MONTHS: Final = 1

SPK_SUBJECT: Final = "sermaye piyasasi kurulu tedbir karari"
SPK_ROUTE: Final = "avoid:spk_tedbir"
NOISE_SUBJECTS: Final = frozenset({"pay bazinda devre kesici bildirimi", "devre kesici uygulanmasi"})
VBTS_CUES: Final = ("vbts", "volatilite bazli tedbir")
VBTS_KINDS: Final[tuple[tuple[str, Kind], ...]] = (
    ("brut takas", "vbts_brut_takas"),
    ("aciga satis", "vbts_aciga_satis"),
    ("kredili islem", "vbts_kredili_islem"),
    ("tek fiyat", "vbts_tek_fiyat"),
    ("emir paketi", "other"),
)
HALT_CUES: Final = ("islem sirasinin durdurul", "islemlerin durdurul", "islem sirasi durdurul", "islemlerinin durdurul")
LIFT_CUES: Final = (
    "islem sirasinin acil",
    "islem sirasi acil",
    "yeniden baslatil",
    "yeniden islem gorm",
    "tedbirin kaldiril",
    "tedbirlerin kaldiril",
    "tedbir uygulamasinin sona",
    "kaldirilmasi",
)

_FOLD: Final = str.maketrans("çğıöşüâîû", "cgiosuaiu")


def text_key(s: str) -> str:
    """Like `join_key` (Turkish lower case, no diacritics) but keeps the punctuation dates need."""
    return re.sub(r"\s+", " ", tr_lower(clean_text(s)).translate(_FOLD)).strip()


DATE_RE: Final = re.compile(r"\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b")
RANGE_RE: Final = re.compile(r"(\d{1,2}[./]\d{1,2}[./]\d{4})\s*(?:-|–|ile)\s*(\d{1,2}[./]\d{1,2}[./]\d{4})")
FROM_RE: Final = re.compile(r"(\d{1,2}[./]\d{1,2}[./]\d{4})\s*(?:tarihinden|gununden|seansindan)\s*itibaren")
UNTIL_RE: Final = re.compile(r"(\d{1,2}[./]\d{1,2}[./]\d{4})\s*(?:tarihine|tarihli seans sonuna|gunune)\s*kadar")
DURATION_RE: Final = re.compile(
    r"(\d{1,3})\s*(?:\([a-z ]+\)\s*)?(is gunu|islem gunu|seans|gun|hafta|ay|yil)\s*(?:sureyle|suresince|boyunca)"
)


@dataclass(frozen=True, slots=True)
class Measure:
    id: str
    ticker: str
    kind: Kind
    start_date: date
    end_date: date | None
    available_at: datetime
    source: Literal["kap", "spk_bulletin", "manual"]
    source_disclosure: int | None
    source_ref: str
    detail: dict[str, Any] = field(default_factory=dict)

    @property
    def expires_at(self) -> datetime | None:
        """The measure applies through `end_date` (inclusive): it expires at the next midnight, Istanbul."""
        if self.end_date is None:
            return None
        return datetime.combine(self.end_date + timedelta(days=1), time(0), IST)


@dataclass(frozen=True, slots=True)
class Lift:
    ticker: str
    kinds: tuple[Kind, ...]  # the measure kinds this notice ends (a bare "açılması" ends a halt)
    on: date
    available_at: datetime
    source_disclosure: int


@dataclass(frozen=True, slots=True)
class Parsed:
    measures: tuple[Measure, ...] = ()
    lifts: tuple[Lift, ...] = ()


def _date(s: str) -> date | None:
    m = DATE_RE.search(s)
    if m is None:
        return None
    try:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def _add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    for day in (d.day, 30, 29, 28):
        try:
            return date(year, month, day)
        except ValueError:
            continue
    raise ValueError("unreachable")  # pragma: no cover - day 28 exists in every month


def _end_from_duration(start: date, n: int, unit: str) -> date | None:
    if n <= 0:
        return None
    if unit in ("is gunu", "islem gunu", "seans"):
        try:
            return add_sessions(start, n - 1)
        except CalendarRangeError:
            return start + timedelta(days=round(n * 7 / 5))
    if unit == "gun":
        return start + timedelta(days=n - 1)
    if unit == "hafta":
        return start + timedelta(days=7 * n - 1)
    if unit == "ay":
        return _add_months(start, n) - timedelta(days=1)
    return _add_months(start, 12 * n) - timedelta(days=1)  # yil


def parse_period(key: str, available_on: date, *, default_months: int | None) -> tuple[date, date | None, str]:
    """(start, end, how) from a join_key'd text; `how` says which cue decided the end."""
    rng = RANGE_RE.search(key)
    if rng is not None:
        lo, hi = _date(rng.group(1)), _date(rng.group(2))
        if lo is not None and hi is not None and hi >= lo:
            return lo, hi, "range"
    start = available_on
    frm = FROM_RE.search(key)
    if frm is not None and (d := _date(frm.group(1))) is not None:
        start = d
    until = UNTIL_RE.search(key)
    if until is not None and (d := _date(until.group(1))) is not None and d >= start:
        return start, d, "until"
    dur = DURATION_RE.search(key)
    if dur is not None:
        end = _end_from_duration(start, int(dur.group(1)), dur.group(2))
        if end is not None:
            return start, end, "duration"
    if default_months is None:
        return start, None, "open"
    return start, _add_months(start, default_months) - timedelta(days=1), "default"


def _kinds(row: dict[str, Any], key: str) -> tuple[list[Kind], bool]:
    """(kinds, inferred) of a notice, [] when it is not a restriction."""
    subject = join_key(str(row.get("subject") or ""))
    if subject in NOISE_SUBJECTS:
        return [], False
    if row.get("subject_route") == SPK_ROUTE or subject == SPK_SUBJECT:
        return ["spk_tedbir"], False
    if any(cue in key for cue in HALT_CUES):
        return ["trading_halt"], False
    found: list[Kind] = [kind for cue, kind in VBTS_KINDS if cue in key]
    if found:
        return list(dict.fromkeys(found)), False
    if any(cue in key for cue in VBTS_CUES):
        return ["vbts_brut_takas"], True
    return [], False


def parse_notice(row: dict[str, Any], text: str | None = None) -> Parsed:
    """One KAP row (+ optional TR text) → measures and lifts for every code it names."""
    key = text_key(" ".join(str(x) for x in (row.get("subject"), row.get("summary"), text) if x))
    if join_key(str(row.get("subject") or "")) in NOISE_SUBJECTS:
        return Parsed()
    codes = affected_codes(row)
    if not codes:
        return Parsed()
    idx = int(row["disclosure_index"])
    available_at: datetime = row["available_at"]
    available_on = istanbul_date(available_at)
    if any(cue in key for cue in LIFT_CUES):
        kinds, _ = _kinds({**row, "subject_route": None}, key.replace("kaldirilmasi", ""))
        lift_kinds: tuple[Kind, ...] = tuple(kinds) if kinds else ("trading_halt",)
        on = _date(key) or available_on
        return Parsed(lifts=tuple(Lift(c, lift_kinds, on, available_at, idx) for c in codes))
    kinds, inferred = _kinds(row, key)
    if not kinds:
        return Parsed()
    measures: list[Measure] = []
    for kind in kinds:
        default = VBTS_DEFAULT_MONTHS if kind.startswith("vbts_") or kind == "other" else None
        start, end, how = parse_period(key, available_on, default_months=default)
        detail: dict[str, Any] = {"period": how, "subject": row.get("subject"), "summary": row.get("summary")}
        if inferred:
            detail["kind_inferred"] = True
        measures.extend(
            Measure(
                id=f"kap:{idx}:{code}:{kind}",
                ticker=code,
                kind=kind,
                start_date=start,
                end_date=end,
                available_at=available_at,
                source="kap",
                source_disclosure=idx,
                source_ref=f"kap:{idx}",
                detail=detail,
            )
            for code in codes
        )
    return Parsed(measures=tuple(measures))


CODE_IN_PARENS_RE: Final = re.compile(r"\(([A-Z0-9]{3,6})\)")


def parse_bulletin_text(text: str, available_at: datetime, ref: str) -> list[Measure]:
    """SPK bulletin text: every sentence naming a share code "(XXXXX)" next to a tedbir / işlem yasağı."""
    out: list[Measure] = []
    for i, sentence in enumerate(re.split(r"(?<=[.;])\s+", text)):
        key = text_key(sentence)
        if "tedbir" not in key and "islem yasag" not in key:
            continue
        start, end, how = parse_period(key, istanbul_date(available_at), default_months=None)
        for code in dict.fromkeys(CODE_IN_PARENS_RE.findall(sentence)):
            out.append(
                Measure(
                    id=f"spk:{ref}:{i}:{code}",
                    ticker=code,
                    kind="spk_tedbir",
                    start_date=start,
                    end_date=end,
                    available_at=available_at,
                    source="spk_bulletin",
                    source_disclosure=None,
                    source_ref=f"spk:{ref}",
                    detail={"period": how, "sentence": sentence[:300]},
                )
            )
    return out


def merge(parsed: Sequence[Parsed]) -> Parsed:
    return Parsed(
        measures=tuple(m for p in parsed for m in p.measures), lifts=tuple(lf for p in parsed for lf in p.lifts)
    )
