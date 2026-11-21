"""Which KAP disclosures tell the person that a company pays a dividend, hands out bonus shares or sells rights.

Deterministic, no model. The subject and the summary decide the kind; the full text (stored only for these
subjects, see `is_corporate_subject`) is read for the facts, and a fact is only filled when its label is found
with a number or a date right after it. Anything else stays None and the panel says it could not be read.

Recorded real subjects this is tested on (tests/fixtures/kap_json): "Kar Payı Dağıtım İşlemlerine İlişkin Bildirim"
(SUMAS), "Sermaye Artırımı - Azaltımı İşlemlerine İlişkin Bildirim" with the summary "Bedelsiz Sermaye Artırımı
Tescili" (AYES). No dividend full text was recorded, so the fact readers are tested on text written in the form's
field labels, not on a recording.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Final, Literal

from kaptan.text.turkish import clean_text, tr_lower

Kind = Literal["dividend", "bonus", "rights", "split"]

_FOLD: Final = str.maketrans("çğıöşüâîû", "cgiosuaiu")
_SPACES: Final = re.compile(r"[ 	]+")


def join_key(s: str) -> str:
    """Lower case without diacritics; digits, commas, dots, % and line ends stay (they carry the facts)."""
    return _SPACES.sub(" ", tr_lower(clean_text(s)).translate(_FOLD)).strip()


#: Words that mean the company has not done it yet or took it back: no prompt.
NOT_YET: Final = ("basvuru", "iptal", "geri cek", "yururlukten kald", "red ", "ret ")
SUBJECT_HINTS: Final = ("kar payi", "sermaye artirimi", "hak kullanim", "pay bolunme")
MAX_PER_SHARE: Final = 10_000.0
MAX_PCT: Final = 10_000.0

_NUM = r"(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)"
_DATE = r"(\d{2})\.(\d{2})\.(\d{4})"
GROSS_RE: Final = re.compile(r"(?:pay|hisse)\s+basina\s+brut[^\d\n]{0,40}?" + _NUM)
NET_RE: Final = re.compile(r"(?:pay|hisse)\s+basina\s+net[^\d\n]{0,40}?" + _NUM)
PAY_RE: Final = re.compile(r"odeme\s+tarihi[^\d\n]{0,20}?" + _DATE)
EX_RE: Final = re.compile(r"hak\s+kullanim\s+tarihi[^\d\n]{0,20}?" + _DATE)
BONUS_LABEL_RE: Final = re.compile(r"bedelsiz[^\n\d%]{0,60}?oran[^\d\n]{0,25}?" + _NUM)
BONUS_SUMMARY_RE: Final = re.compile(r"%\s*" + _NUM + r"[^\n]{0,20}bedelsiz|bedelsiz[^\n\d]{0,20}%\s*" + _NUM)


@dataclass(frozen=True, slots=True)
class Detected:
    kind: Kind
    per_share_gross: float | None = None
    per_share_net: float | None = None
    pay_date: date | None = None
    ex_date: date | None = None
    bonus_pct: float | None = None


def is_corporate_subject(subject: str) -> bool:
    """Subjects worth fetching the full text for (a hint only: `detect` decides)."""
    key = join_key(subject)
    return any(h in key for h in SUBJECT_HINTS)


def parse_tr_number(raw: str) -> float | None:
    """'1.250,50' / '12,5' / '12.5' -> float; None when it is not a plain number."""
    text = raw.strip()
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _day(m: re.Match[str] | None) -> date | None:
    if m is None:
        return None
    try:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def _amount(pattern: re.Pattern[str], text: str, cap: float) -> float | None:
    m = pattern.search(text)
    value = parse_tr_number(m.group(1)) if m else None
    return value if value is not None and 0 < value <= cap else None


def _kind(subject: str, summary: str) -> Kind | None:
    key = join_key(f"{subject} {summary}")
    if any(w in key for w in NOT_YET):
        return None
    if "kar payi" in key and ("dagitim" in key or "odeme" in key):
        return "dividend"
    capital = "sermaye artirimi" in key
    done = "tescil" in key or "hak kullanim" in key
    if capital and "bedelsiz" in key and done:
        return "bonus"
    if capital and "bedelli" in key and done:
        return "rights"
    if "pay bolunme" in key and "kismi" not in key:
        return "split"
    return None


def _bonus_pct(summary_key: str, text_key: str) -> float | None:
    value = _amount(BONUS_LABEL_RE, text_key, MAX_PCT)
    if value is not None:
        return value
    m = BONUS_SUMMARY_RE.search(summary_key)
    raw = (m.group(1) or m.group(2)) if m else None
    parsed = parse_tr_number(raw) if raw else None
    return parsed if parsed is not None and 0 < parsed <= MAX_PCT else None


def detect(subject: str, summary: str, text: str = "") -> Detected | None:
    """The kind of action a disclosure announces and the facts that could be read, or None."""
    kind = _kind(subject, summary)
    if kind is None:
        return None
    body = join_key(text)
    if kind == "dividend":
        return Detected(
            kind,
            per_share_gross=_amount(GROSS_RE, body, MAX_PER_SHARE),
            per_share_net=_amount(NET_RE, body, MAX_PER_SHARE),
            pay_date=_day(PAY_RE.search(body)),
            ex_date=_day(EX_RE.search(body)),
        )
    if kind == "bonus":
        return Detected(kind, bonus_pct=_bonus_pct(join_key(summary), body), ex_date=_day(EX_RE.search(body)))
    return Detected(kind, ex_date=_day(EX_RE.search(body)))
