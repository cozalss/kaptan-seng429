"""Turkish/English rule-based prompt-injection check (09 §3 L3, 05 §8 L1; canonical, `06` R11).

Runs on the Turkish-lower-cased NFC text (İ→i, I→ı before `lower()`), so "ÖNCEKİ TALİMATLARI YOK SAY"
and "önceki talimatları yok say" match the same rule. Prompt Guard 2 does not officially support
Turkish, which is why this list exists; it is calibrated against the red-team set (false positives are
measured and reported, never silently tolerated).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Final

_TR_UPPER_TO_LOWER: Final = str.maketrans({"İ": "i", "I": "ı"})


def tr_lower(text: str) -> str:
    """Turkish-safe lower case (NFC): dotted/dotless i survive."""
    return unicodedata.normalize("NFC", text).translate(_TR_UPPER_TO_LOWER).lower()


#: (rule id, pattern on tr_lower(text)). Keep patterns specific: KAP prose is formal and repetitive.
RULES: Final[tuple[tuple[str, re.Pattern[str]], ...]] = (
    (
        "talimat_yok_say",
        re.compile(
            r"(önceki|yukarıdaki|tüm|bütün|verilen)\s+(talimat|yönerge|komut|kural)\w*\s+"
            r"(yok\s*say|unut|görmezden\s*gel|dikkate\s*alma|geçersiz)"
        ),
    ),
    ("talimatlarini_unut", re.compile(r"talimatlar\w*\s+(unut|yok\s*say|görmezden)")),
    ("sistem_notu", re.compile(r"(sistem|system)\s*(notu|mesajı|talimatı|prompt)")),
    ("rol_etiketi", re.compile(r"(^|\n)\s*(system|assistant|sistem|asistan)\s*:\s")),
    (
        "yz_hitap",
        re.compile(
            r"(yapay\s*zeka|yapay\s*zekâ|dil\s*modeli|llm|asistan|ajan)\w*\s*,?\s*(olarak\s+)?"
            r"(şunu|bunu)?\s*(yap|yaz|sınıflandır|onayla|işaretle)\b"
        ),
    ),
    (
        "guven_dayatma",
        re.compile(
            r"(confidence|güven\w*)\s*[:=]\s*(1([.,]0+)?|%\s*100)(?![\d.,])"
            r"|güven\w*\s*(skorunu|değerini)?\s*(1([.,]0+)?|%\s*100)\s*(yaz|ver|olarak\s+ayarla)"
        ),
    ),
    ("al_sinyali", re.compile(r"(al|satın\s*al|buy)\s+(sinyali|önerisi|emri|kararı)\s+(ver|üret|yaz|oluştur)")),
    ("sinif_dayatma", re.compile(r"\be[1-4]\s+olarak\s+(sınıflandır|işaretle|etiketle)")),
    ("onay_atlatma", re.compile(r"onay\s*(adımını|sürecini|adımı)?\s*(atla|geç|devre\s*dışı)")),
    ("risk_yok_de", re.compile(r"risk\s+yok\s+(de|yaz|olarak)")),
    ("json_dayatma", re.compile(r"json\s*(çıktı|formatında|olarak)\s*(şu|aşağıdaki|şunu)")),
    ("rol_degistir", re.compile(r"\b(sen\s+artık|bundan\s+sonra\s+sen)\b")),
    ("en_ignore", re.compile(r"ignore\s+(all\s+)?(the\s+)?(previous|prior|above)\s+(instructions|rules)")),
    ("en_you_are_now", re.compile(r"\byou\s+are\s+now\b")),
    ("en_developer_mode", re.compile(r"\bdeveloper\s+mode\b")),
    ("en_respond_only", re.compile(r"\brespond\s+only\s+with\b")),
)


@dataclass(frozen=True, slots=True)
class RuleHit:
    rule: str
    excerpt: str


def fold_obfuscation(text: str) -> str:
    """NFKC (full-width ｉｇｎｏｒｅ → ignore) without invisible format characters (zero-width space, soft
    hyphen, bidi marks: Unicode category Cf), so a hidden instruction cannot dodge the rules (red-team enc-*)."""
    return "".join(ch for ch in unicodedata.normalize("NFKC", text) if unicodedata.category(ch) != "Cf")


def rule_hits(text: str) -> list[RuleHit]:
    """Every rule that matches, with the matched excerpt (≤ 80 chars, lower-cased)."""
    lowered = tr_lower(fold_obfuscation(text))
    hits: list[RuleHit] = []
    for rule, pattern in RULES:
        m = pattern.search(lowered)
        if m is not None:
            hits.append(RuleHit(rule, m.group(0).strip()[:80]))
    return hits
