"""Person-name masking before any text leaves the machine (KVKK; 09 §9.2, `_KANONIK-KARARLAR` Rev. 3).

Unmasked text never goes to a free-tier provider: every live call (Prompt Guard included) sends
`mask_persons(text).text`. Names become `KİŞİ_1`, `KİŞİ_2`, … in order of first appearance; the same
name (Turkish case-insensitive) always gets the same token, and tokens already in the text are kept.

Name sources, strongest first:
1. `known` names the caller passes (E2 form fields, the KAP member/manager list when ingested).
2. Names anchored by a title or role ("Sayın …", "Yönetim Kurulu Üyesi …", "Genel Müdür …",
   "Adı Soyadı: …", "…, Yönetim Kurulu Başkanı").
3. A common Turkish first name followed by a capitalised surname ("Mehmet ÖZTÜRK").
This is a recall-oriented heuristic, not NER: company names are protected by a stop list
(A.Ş., Holding, Bankası, …); misses are measured on the gold set (09 §9.2 item 1).
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Final

from kaptan.llm.injection_rules_tr import tr_lower

MASK_PREFIX: Final = "KİŞİ_"
_EXISTING: Final = re.compile(r"KİŞİ_(\d+)")
_PLACEHOLDER: Final = re.compile(r"\x00\d+\x00")  # internal marker, cannot occur in KAP text
_UP: Final = "A-ZÇĞİÖŞÜ"
_LOW: Final = "a-zçğıöşüâîû"
#: A capitalised name word: "Ahmet", "ÖZTÜRK", "Özdemir-Kaya"; "'ın" style suffixes stay outside.
_WORD: Final = rf"[{_UP}](?:[{_LOW}]+|[{_UP}]+)(?:-[{_UP}](?:[{_LOW}]+|[{_UP}]+))?"
_NAME: Final = rf"{_WORD}(?:\s+{_WORD}){{1,2}}"

_TITLES: Final = (
    r"Sayın|Sn\.|Bay|Bayan|Dr\.|Prof\.\s*Dr\.|Doç\.\s*Dr\.|Av\.|Mali\s+Müşavir|"
    r"Yönetim\s+Kurulu\s+(?:Başkanı|Başkan\s+Vekili|Üyesi)|Bağımsız\s+Yönetim\s+Kurulu\s+Üyesi|"
    r"Genel\s+Müdür(?:ü)?(?:\s+Yardımcısı)?|Murahhas\s+Üye|İcra\s+Kurulu\s+(?:Başkanı|Üyesi)|"
    r"Yatırımcı\s+İlişkileri\s+(?:Müdürü|Yöneticisi)|Mali\s+İşler\s+(?:Direktörü|Müdürü)|"
    r"Denetim\s+Komitesi\s+(?:Başkanı|Üyesi)|CEO|CFO|COO"
)
_LABELS: Final = r"Adı\s+Soyadı|Ad\s+Soyad|Ad[ıi]\s*-\s*Soyad[ıi]|Bildirim\s+Yükümlüsü|İşlemi\s+Yapan\s+Kişi"
_ROLE_AFTER: Final = r"Yönetim\s+Kurulu|Genel\s+Müdür|Murahhas|Bağımsız\s+Üye|CEO|CFO|Hakim\s+Ortak"

_AFTER_TITLE: Final = re.compile(rf"(?:{_TITLES})\s*:?\s+(?P<name>{_NAME}|{_WORD})")
_AFTER_LABEL: Final = re.compile(rf"(?:{_LABELS})\s*:\s*(?P<name>{_NAME})")
_BEFORE_ROLE: Final = re.compile(rf"(?P<name>{_NAME})\s*(?:,|\()\s*(?:{_ROLE_AFTER})")


def _words(text: str) -> list[str]:
    return text.split()


#: Frequent Turkish first names (TÜİK most common given names, abridged).
FIRST_NAMES: Final = frozenset(
    tr_lower(n)
    for n in _words(
        "Ahmet Mehmet Mustafa Ali Hüseyin Hasan İbrahim İsmail Osman Yusuf Murat Ömer Ramazan Halil Süleyman "
        "Abdullah Mahmut Recep Kemal Salih Fatih Kadir Emre Burak Serkan Hakan Orhan Cem Can Ege Kerem Onur "
        "Volkan Tolga Barış Levent Erkan Erdem Selim Sinan Tamer Tuncay Uğur Yasin Zeki Bülent Cengiz Deniz "
        "Faruk Gökhan Kaan Metin Nihat Oğuz Selçuk Tarık Turgut Yavuz Erol Ercan Ferhat Haluk Ilgaz Arda "
        "Fatma Ayşe Emine Hatice Zeynep Elif Meryem Şerife Zehra Sultan Hanife Merve Esra Özlem Ebru Gül "
        "Aylin Ayşegül Burcu Canan Derya Didem Ece Esin Feride Gamze Hande Işıl Leyla Melike Nazlı Nilüfer "
        "Pınar Selin Sevgi Seda Sibel Tuba Tülay Yasemin Yeşim Zerrin Banu Berna Dilek Filiz Gonca Neslihan"
    )
)
_WORD_RE: Final = re.compile(rf"(?<![\w]){_WORD}")
_NAME_RE: Final = re.compile(_NAME)
_LEAD_TITLES: Final = frozenset({"sayın", "bay", "bayan"})

#: Words that make a capitalised phrase a company/institution, never a person.
_ORG_WORDS: Final = frozenset(
    tr_lower(w)
    for w in _words(
        "A.Ş. AŞ Anonim Şirketi Şirket Şirketimiz Holding Bankası Bank Sigorta Yatırım Portföy Menkul Değerler "
        "Enerji Elektrik İnşaat Sanayi Ticaret Limited Ltd Grup Group Kurulu Kurul Kurumu Bakanlığı Başkanlığı "
        "Müdürlüğü Belediyesi Üniversitesi Borsa İstanbul Kamuyu Aydınlatma Platformu Sermaye Piyasası Türkiye "
        "Cumhuriyeti Genel Müdür Yönetim Komitesi Fonu Fon Teknoloji Gıda Otomotiv Madencilik Lojistik"
    )
)


@dataclass(frozen=True, slots=True)
class MaskResult:
    text: str
    names_masked: int  # distinct names replaced in this call (pre-existing KİŞİ_n tokens not counted)


def _is_org(name: str) -> bool:
    return any(tr_lower(w) in _ORG_WORDS for w in name.split())


def _trim(name: str) -> str | None:
    """Drop leading honorifics and trailing organisation words; None if an org word remains."""
    words = name.split()
    while words and tr_lower(words[0]) in _LEAD_TITLES:
        words = words[1:]
    while words and tr_lower(words[-1]) in _ORG_WORDS:
        words = words[:-1]
    if not words or _is_org(" ".join(words)):
        return None
    return " ".join(words)


def _candidates(text: str, known: Iterable[str]) -> list[str]:
    found: list[str] = [k.strip() for k in known if k and k.strip()]
    for pattern in (_AFTER_LABEL, _AFTER_TITLE, _BEFORE_ROLE):
        found.extend(m.group("name") for m in pattern.finditer(text))
    for w in _WORD_RE.finditer(text):
        if tr_lower(w.group(0)) in FIRST_NAMES:
            m = _NAME_RE.match(text, w.start())
            if m is not None:
                found.append(m.group(0))
    trimmed = (_trim(n) for n in found if not n.startswith(MASK_PREFIX))
    return [n for n in trimmed if n is not None]


def mask_persons(text: str, known: Iterable[str] = ()) -> MaskResult:
    """Replace person names with KİŞİ_n tokens (pure; returns a new string)."""
    keys = list(dict.fromkeys(tr_lower(name) for name in _candidates(text, known)))
    masked = text
    # Longest first, so "Ayşe Kaya Demir" is replaced before "Ayşe Kaya"; placeholders first, numbers later.
    for i, key in sorted(enumerate(keys), key=lambda ik: len(ik[1]), reverse=True):
        masked = _replace_ci(masked, key, f"\x00{i}\x00")
    next_n = max((int(n) for n in _EXISTING.findall(text)), default=0) + 1
    numbers: dict[str, str] = {}
    for placeholder in _PLACEHOLDER.findall(masked):  # numbered by first appearance in the text
        if placeholder not in numbers:
            numbers[placeholder] = f"{MASK_PREFIX}{next_n}"
            next_n += 1
    masked = _PLACEHOLDER.sub(lambda m: numbers[m.group(0)], masked)
    return MaskResult(masked, len(numbers))


def _replace_ci(text: str, lowered_name: str, token: str) -> str:
    """Turkish case-insensitive whole-word replacement (tr_lower keeps string length for these letters)."""
    lowered = tr_lower(text)
    if len(lowered) != len(text):  # pragma: no cover - only exotic code points change length on lower()
        return re.sub(re.escape(lowered_name), token, text, flags=re.I)
    out: list[str] = []
    pos = 0
    pattern = re.compile(rf"(?<![\w]){re.escape(lowered_name)}(?![\w])")
    for m in pattern.finditer(lowered):
        out.append(text[pos : m.start()])
        out.append(token)
        pos = m.end()
    out.append(text[pos:])
    return "".join(out)
