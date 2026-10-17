"""Free-text search over the ledger: port of kaptan-panel/src/lib/audit-words.ts (auditMatches()).

A record matches when the needle (Turkish-aware lower case) occurs in its plain Turkish sentence
(auditSentence()), who did it (name and kind), the action, the entity id or the payload's JSON.
"#3907" / "#3.907" finds the record at that chain position. Pure: the caller passes the issuer
names (ticker → registered name) that the panel resolves through its issuer list.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from typing import Any, Final

from kaptan.audit.canonical import js_json, js_number
from kaptan.domain.roles import ROLE_LABEL, member_by_uid
from kaptan.domain.schemas.run import NODE_LABELS

SCENARIO_TR: Final[dict[str, str]] = {
    "e3_contract": "yeni iş",
    "redteam_injection": "gizli talimat",
    "restricted_r04": "tedbirli hisse",
    "loss_simulation": "zarar simülasyonu",
}

SYSTEM_NAMES: Final[dict[str, str]] = {
    "kap_poller": "KAP okuyucu",
    "simbist": "KAPtan hesabı borsası (SimBIST)",
    "risk_monitor": "Risk izleyici",
    "order_ticket": "Fiş yazıcı",
    "scheduler": "Zamanlayıcı",
    "nightly_verify": "Gece doğrulaması",
    "restrictions_sync": "Tedbir listesi",
}

#: Crew members whose plain name reads better than the pipeline label (actors.ts NODE_NAMES).
NODE_NAMES: Final[dict[str, str]] = {"request_approval": "Öneri yazıcı"}

NO_COMPANY: Final = "bir şirket"
_LEGAL_SUFFIX: Final = re.compile(r"\s+A\.Ş\.?$")
_POSITION: Final = re.compile(r"^#\s*([0-9.]+)$")
_WS_SPLIT: Final = re.compile(r"(\s+)")

Entry = Mapping[str, Any]
Issuers = Mapping[str, str]


# ── Turkish text helpers (toLocaleLowerCase / toLocaleUpperCase "tr-TR", titleTr) ──
def tr_lower(text: str) -> str:
    """Turkish-aware lower case (İ → i, I → ı)."""
    return text.replace("İ", "i").replace("I", "ı").lower()


def tr_upper(text: str) -> str:
    return text.replace("i", "İ").replace("ı", "I").upper()


def _is_dotted_abbreviation(token: str) -> bool:
    return "." in token and sum(ch.isalpha() for ch in token) <= 3


def _title_token(token: str) -> str:
    if not token.strip() or _is_dotted_abbreviation(token):
        return token
    lower = tr_lower(token)
    for i, ch in enumerate(lower):
        if ch.isalpha():
            return lower[:i] + tr_upper(ch) + lower[i + 1 :]
    return lower


def title_tr(name: str) -> str:
    """'DOĞU ENERJİ ÜRETİM A.Ş.' → 'Doğu Enerji Üretim A.Ş.' (whitespace kept as it was)."""
    return "".join(_title_token(t) for t in _WS_SPLIT.split(name))


# ── who and what ──────────────────────────────────────────────────────────
def _str(value: Any) -> str | None:
    """audit-words.ts str(): a non-empty string, a number as text, else None."""
    if isinstance(value, str):
        return value or None
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return js_number(value)
    return None


def actor_parts(actor: str | None) -> tuple[str, str]:
    """actors.ts actorParts(): (name, kind), e.g. ("Üye 3", "Risk Sorumlusu"), ("Şüpheci", "Tayfa")."""
    if not actor:
        return ("—", "")
    member = member_by_uid(actor)
    if member is not None:
        return (member.name, ROLE_LABEL[member.role])
    if actor.startswith("user:"):
        return (actor[5:], "Kullanıcı")
    if actor.startswith("agent:"):
        node = actor[6:]
        label = NODE_LABELS.get(node)
        return (NODE_NAMES.get(node) or (label[0] if label else node), "Tayfa")
    if actor.startswith("system:"):
        job = actor[7:]
        return (SYSTEM_NAMES.get(job, job), "Sistem")
    return (actor, "")


def _subject(actor: str) -> str:
    member = member_by_uid(actor)
    return ROLE_LABEL[member.role] if member is not None else actor_parts(actor)[0]


def audit_company(entry: Entry, issuers: Issuers) -> str:
    """The company a record is about, as a reader says it ("Örnek Enerji"), or the bare ticker."""
    payload = entry["payload"]
    company = _str(payload.get("company"))
    if company:
        return title_tr(_LEGAL_SUFFIX.sub("", company))
    ticker = _str(payload.get("ticker"))
    if not ticker:
        return NO_COMPANY
    known = issuers.get(ticker)
    return title_tr(_LEGAL_SUFFIX.sub("", known)) if known else ticker


# ── sentences ─────────────────────────────────────────────────────────────
Phrase = Callable[[Entry, str, str], str]


def _filled(e: Entry, what: str) -> str:
    qty = _str(e["payload"].get("qty"))
    buy = f"{qty} lot alış" if qty else "alış"
    line = buy if what == NO_COMPANY else f"{what} için {buy}"
    return f"{tr_upper(line[:1])}{line[1:]} gerçekleşti (KAPtan hesabı)."


def _decided(e: Entry, who: str, what: str) -> str:
    rejected = e["payload"].get("decision") in ("reject", "rejected")
    return f"{who} {what} önerisini reddetti." if rejected else f"{who} {what} önerisini imzaladı."


def _kill_on(e: Entry, who: str, _what: str) -> str:
    if e["actor"] == "system:risk_monitor":
        return "Risk izleyici zirveden −%5’te her şeyi durdurdu."
    return f"{who} her şeyi durdurdu."


def _verified(e: Entry, who: str, _what: str) -> str:
    if str(e["actor"]).startswith("system:"):
        return "Gece doğrulaması defteri baştan sona yürüdü."
    return f"{who} defteri doğruladı."


def _injected(e: Entry, _who: str, _what: str) -> str:
    key = _str(e["payload"].get("scenario")) or str(e["entity_id"])
    return f"Senaryo eklendi: {SCENARIO_TR.get(key, 'senaryo')}."


PHRASES: Final[dict[str, Phrase]] = {
    "disclosure.ingested": lambda _e, _w, what: f"KAP okuyucu {what} bildirimini getirdi.",
    "classification.done": lambda _e, _w, _x: "Sınıflandırıcı bir bildirimin türünü belirledi.",
    "pregate.decided": lambda _e, _w, _x: "Ön eleme bir bildirimi süzdü.",
    "agent.output": lambda _e, who, _x: f"{who} notunu yazdı.",
    "rule.decided": lambda _e, _w, _x: "Kural motoru eşikleri tarttı.",
    "risk.checked": lambda _e, _w, _x: "Risk kapısı bir öneriyi denetledi.",
    "risk.rejected": lambda _e, _w, what: f"Kurallar {what} için öneriyi baştan reddetti (tedbirli hisse).",
    "compliance.rejected": lambda _e, _w, what: f"Uyum {what} bildirimindeki gizli talimatı yakaladı; öneri çıkmadı.",
    "proposal.created": lambda _e, _w, what: f"Tayfa {what} için öneri hazırladı.",
    "approval.decided": _decided,
    "order.filled": lambda e, _w, what: _filled(e, what),
    "ticket.issued": lambda _e, _w, what: f"{what} için emir fişi yazıldı.",
    "ticket.entered": lambda _e, who, _x: f"{who} emir fişini aracı kuruma girdi.",
    "ticket.unfilled": lambda _e, who, _x: f"{who} emir fişini “dolmadı” diye işaretledi.",
    "ticket.canceled": lambda _e, who, _x: f"{who} emir fişini iptal etti.",
    "kill_switch.on": _kill_on,
    "kill_switch.reset_started": lambda _e, who, _x: f"{who} yeniden başlatmayı başlattı (1/2).",
    "kill_switch.reset": lambda _e, who, _x: f"{who} yeniden başlatmayı onayladı (2/2).",
    "risk.halted": lambda _e, _w, _x: "Günlük −%1 sınırı aşıldı: yeni emir durdu.",
    "limits.proposed": lambda _e, who, _x: f"{who} bir sınır değişikliği önerdi (1/2).",
    "limits.approved": lambda _e, who, _x: f"{who} sınır değişikliğini onayladı (2/2).",
    "limits.rejected": lambda _e, who, _x: f"{who} sınır değişikliğini reddetti.",
    "note.added": lambda _e, who, _x: f"{who} not ekledi.",
    "audit.verified": _verified,
    "brief.generated": lambda _e, _w, _x: "Sabah özeti hazırlandı.",
    "demo.injected": _injected,
}


def audit_sentence(entry: Entry, issuers: Issuers) -> str:
    """One record as one plain Turkish sentence (auditSentence())."""
    who = _subject(str(entry["actor"]))
    what = audit_company(entry, issuers)
    phrase = PHRASES.get(str(entry["action"]))
    return phrase(entry, who, what) if phrase else f"{who}: {entry['action']}"


def audit_matches(entry: Entry, q: str, issuers: Issuers) -> bool:
    """auditMatches(): does a record match a free-text search?"""
    needle = tr_lower(q.strip())
    if not needle:
        return True
    pos = _POSITION.match(needle)
    if pos:
        digits = pos.group(1).replace(".", "")
        return int(entry["chain_pos"]) == (int(digits) if digits else 0)
    name, kind = actor_parts(str(entry["actor"]))
    hay = " ".join(
        [
            audit_sentence(entry, issuers),
            name,
            kind,
            str(entry["action"]),
            str(entry["entity_id"]),
            js_json(dict(entry["payload"])),
        ]
    )
    return needle in tr_lower(hay)
