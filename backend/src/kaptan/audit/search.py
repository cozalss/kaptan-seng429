"""Free-text search over the ledger: port of kaptan-panel/src/lib/audit-words.ts (auditMatches()).

Every record was done by "Sen" or by "KAPtan". A record matches when the needle (Turkish-aware lower case) occurs in
its plain Turkish sentence (auditSentence()), who did it (name and kind), the action, the entity id or the payload's
JSON.
"#3907" / "#3.907" finds the record at that chain position. Pure: the caller passes the issuer
names (ticker → registered name) that the panel resolves through its issuer list.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from typing import Any, Final

from kaptan.audit.canonical import js_json, js_number
from kaptan.domain.schemas.run import NODE_LABELS

SCENARIO_TR: Final[dict[str, str]] = {
    "e3_contract": "yeni iş",
    "redteam_injection": "gizli talimat",
    "restricted_r04": "tedbirli hisse",
    "loss_simulation": "zarar simülasyonu",
}

#: What each part of the system does, in a record's small print (actors.ts SYSTEM_PARTS).
SYSTEM_PARTS: Final[dict[str, str]] = {
    "kap_poller": "bildirim okuma",
    "simbist": "deneme hesabı",
    "risk_monitor": "para kuralları",
    "order_ticket": "işlem bilgisi",
    "scheduler": "zamanlayıcı",
    "nightly_verify": "gece kontrolü",
    "restrictions_sync": "tedbir listesi",
}

YOU: Final = "Sen"
SYSTEM: Final = "KAPtan"

#: What a waiver covered: a step that used to need a second person.
WAIVER_FLOW: Final[dict[str, str]] = {
    "kill_reset": "Yeniden başlatmayı",
    "limits": "Sınır değişikliğini",
    "live_arm": "Canlı işlemi",
    "restricted_removal": "Yasak listesinden çıkarmayı",
}

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


def is_person(actor: str | None) -> bool:
    """actors.ts isPerson(): anything that is not a part of the system."""
    return bool(actor) and not str(actor).startswith(("agent:", "system:")) and actor != "auth"


def actor_parts(actor: str | None) -> tuple[str, str]:
    """actors.ts actorParts(): (who, which part of KAPtan), e.g. ("Sen", ""), ("KAPtan", "Şüpheci")."""
    if not actor:
        return ("—", "")
    if is_person(actor):
        return (YOU, "")
    if actor == "auth":
        return (SYSTEM, "giriş")
    if actor.startswith("agent:"):
        label = NODE_LABELS.get(actor[6:])
        return (SYSTEM, label[0] if label else "")
    return (SYSTEM, SYSTEM_PARTS.get(actor[7:], ""))


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
Phrase = Callable[[Entry, str], str]


def _filled(e: Entry, what: str) -> str:
    qty = _str(e["payload"].get("qty"))
    buy = f"{qty} adet alış" if qty else "alış"
    line = buy if what == NO_COMPANY else f"{what} için {buy}"
    return f"{tr_upper(line[:1])}{line[1:]} gerçekleşti (deneme hesabı)."


def _ticket_issued(e: Entry, what: str) -> str:
    if what != NO_COMPANY:
        return f"{what} için bankana gireceğin işlem hazırlandı."
    qty = _str(e["payload"].get("qty"))
    if not qty:
        return "Bankana gireceğin işlem hazırlandı."
    side = {"sell": "satış ", "buy": "alış "}.get(str(e["payload"].get("side")), "")
    return f"{qty} adetlik {side}işlem hazırlandı."


def _decided(e: Entry, what: str) -> str:
    rejected = e["payload"].get("decision") in ("reject", "rejected")
    return f"{what} önerisini reddettin." if rejected else f"{what} önerisini onayladın."


def _kill_on(e: Entry, _what: str) -> str:
    return "Her şeyi durdurdun." if is_person(e["actor"]) else "Paran zirvesinden %5 düştü; KAPtan her şeyi durdurdu."


def _verified(e: Entry, _what: str) -> str:
    if is_person(e["actor"]):
        return "Kayıtların sağlam olup olmadığına baktın."
    return "KAPtan gece kayıtları baştan sona kontrol etti."


def _injected(e: Entry, _what: str) -> str:
    key = _str(e["payload"].get("scenario")) or str(e["entity_id"])
    return f"Deneme olayı eklendi: {SCENARIO_TR.get(key, 'senaryo')}."


def _waiver(e: Entry, _what: str) -> str:
    flow = WAIVER_FLOW.get(_str(e["payload"].get("flow")) or "", "Bu adımı")
    return f"{flow} tek başına onayladın; bu da kayda geçti."


#: Why the pre-gate vetoed, by the first rule code in the payload's reasons (panel audit-words.ts VETO_REASON).
VETO_REASON: Final[dict[str, str]] = {
    "R01": "her şey durdurulmuştu",
    "R02": "günlük zarar sınırı",
    "R03": "hisse izlenen evrenin dışında",
    "R04": "tedbirli hisse",
    "R09": "fiyat bandının dışında",
    "R10": "kriz rejimi",
    "R11": "kota ya da veri sorunu",
    "R12": "yalnızca alım kuralı",
    "R13": "yasak listende",
}
VETO_CODE: Final = re.compile(r"^(R\d{2})")


def veto_reason(e: Mapping[str, Any]) -> str | None:
    reasons = e["payload"].get("reasons")
    for r in reasons if isinstance(reasons, list) else []:
        m = VETO_CODE.match(r) if isinstance(r, str) else None
        if m and m.group(1) in VETO_REASON:
            return VETO_REASON[m.group(1)]
    return None


def _rejected(e: Mapping[str, Any], what: str) -> str:
    why = veto_reason(e)
    return f"KAPtan {what} için öneriyi baştan eledi{f' ({why})' if why else ''}."


PHRASES: Final[dict[str, Phrase]] = {
    "disclosure.ingested": lambda _e, what: f"KAPtan {what} bildirimini okudu.",
    "classification.done": lambda _e, _x: "KAPtan bir bildirimin türünü belirledi.",
    "pregate.decided": lambda _e, _x: "KAPtan bir bildirimi eledi.",
    "agent.output": lambda _e, _x: "KAPtan bir inceleme notu yazdı.",
    "rule.decided": lambda _e, _x: "KAPtan kurallara baktı.",
    "risk.checked": lambda _e, _x: "KAPtan bir öneriyi sınırlarla karşılaştırdı.",
    "risk.rejected": _rejected,
    "compliance.rejected": lambda _e, what: f"KAPtan {what} bildirimindeki gizli talimatı yakaladı; öneri çıkmadı.",
    "proposal.created": lambda _e, what: f"KAPtan {what} için öneri hazırladı.",
    "approval.decided": _decided,
    "order.filled": _filled,
    "ticket.issued": _ticket_issued,
    "ticket.entered": lambda _e, _x: "İşlemi bankana girdiğini işaretledin.",
    "ticket.unfilled": lambda _e, _x: "İşlemin gerçekleşmediğini işaretledin.",
    "ticket.canceled": lambda _e, _x: "İşlemi girmediğini işaretledin.",
    "kill_switch.on": _kill_on,
    "kill_switch.reset_started": lambda _e, _x: "Yeniden başlatmayı istedin.",
    "kill_switch.reset": lambda _e, _x: "İşlemleri yeniden başlattın.",
    "auth.login_failed": lambda _e, _x: "Yanlış parolayla giriş denendi.",
    "auth.login": lambda _e, _x: "Giriş yaptın.",
    "auth.logout": lambda _e, _x: "Çıkış yaptın.",
    "auth.single_user_waiver": _waiver,
    "kill_switch.wait_waived": lambda _e, _x: "Yeniden başlatma için beklemedin (deneme); bu da kayda geçti.",
    "suggestion.held": lambda _e, what: f"{what} için “Tut” dedin.",
    "suggestion.skipped": lambda _e, what: f"{what} önerisini geçtin.",
    "risk.halted": lambda _e, _x: "Paran bir günde %1 düştü; bugünlük yeni işlem durdu.",
    "limits.proposed": lambda _e, _x: "Bir sınırı değiştirmek istedin.",
    "limits.approved": lambda _e, _x: "Sınır değişikliğini onayladın.",
    "limits.rejected": lambda _e, _x: "Sınır değişikliğinden vazgeçtin.",
    "note.added": lambda _e, _x: "Not ekledin.",
    "audit.verified": _verified,
    "brief.generated": lambda _e, _x: "KAPtan sabah özetini hazırladı.",
    "demo.injected": _injected,
}


def audit_sentence(entry: Entry, issuers: Issuers) -> str:
    """One record as one plain Turkish sentence (auditSentence())."""
    what = audit_company(entry, issuers)
    phrase = PHRASES.get(str(entry["action"]))
    if phrase:
        return phrase(entry, what)
    return "Bir işlem yaptın." if is_person(str(entry["actor"])) else f"{SYSTEM} bir işlem yaptı."


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
