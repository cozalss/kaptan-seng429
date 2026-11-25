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
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Final

from kaptan.audit.canonical import js_json, js_number
from kaptan.domain.schemas.run import NODE_LABELS

#: What each part of the system does, in a record's small print (actors.ts SYSTEM_PARTS).
SYSTEM_PARTS: Final[dict[str, str]] = {
    "kap_poller": "bildirim okuma",
    "simbist": "işlem kaydı",
    "risk_monitor": "para kuralları",
    "order_ticket": "işlem bilgisi",
    "scheduler": "zamanlayıcı",
    "nightly_verify": "gece kontrolü",
    "restrictions_sync": "tedbir listesi",
}

YOU: Final = "Sen"
SYSTEM: Final = "KAPtan"

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


def _upper_first(text: str) -> str:
    return f"{tr_upper(text[:1])}{text[1:]}"


def _filled(e: Entry, what: str) -> str:
    qty = _str(e["payload"].get("qty"))
    side = "satış" if e["payload"].get("side") == "sell" else "alış"
    order = f"{qty} adet {side}" if qty else side
    line = order if what == NO_COMPANY else f"{what} için {order}"
    return f"{_upper_first(line)} gerçekleşti."


def _ticket_issued(e: Entry, what: str) -> str:
    if what != NO_COMPANY:
        return f"{what} için bankana gireceğin işlem hazırlandı."
    qty = _str(e["payload"].get("qty"))
    if not qty:
        return "Bankana gireceğin işlem hazırlandı."
    side = {"sell": "satış ", "buy": "alış "}.get(str(e["payload"].get("side")), "")
    return f"{qty} adetlik {side}işlem hazırlandı."


NBSP: Final = " "


def _lira(value: Any) -> str | None:
    """audit-words.ts lira(): "50.000 ₺" (kuruş only when there is one) from a payload number, else None."""
    if isinstance(value, bool) or not isinstance(value, int | float) or value != value or abs(value) == float("inf"):
        return None
    whole_number = float(value).is_integer()
    amount = Decimal(repr(float(value))).quantize(Decimal(1) if whole_number else Decimal("0.01"), ROUND_HALF_UP)
    text = f"{abs(amount):,.0f}" if whole_number else f"{abs(amount):,.2f}"
    text = text.translate({ord(","): ".", ord("."): ","})
    return f"{'−' if amount < 0 else ''}{text}{NBSP}₺"


def _money(lead: str) -> Phrase:
    def phrase(e: Entry, _what: str) -> str:
        amount = _lira(e["payload"].get("amount_try"))
        return f"{lead}: {amount}." if amount else f"{lead}."

    return phrase


def _money_corrected(e: Entry, _what: str) -> str:
    old, new = _lira(e["payload"].get("old_amount_try")), _lira(e["payload"].get("new_amount_try"))
    return f"Parayı düzelttin: {old} yerine {new}." if old and new else "Bir para hareketini düzelttin."


def _money_undone(e: Entry, _what: str) -> str:
    amount = _lira(e["payload"].get("amount_try"))
    return f"Bir para hareketini geri aldın: {amount}." if amount else "Bir para hareketini geri aldın."


def _holding_added(e: Entry, what: str) -> str:
    qty = _str(e["payload"].get("qty"))
    cost = _lira(e["payload"].get("avg_cost"))
    base = f"Elindeki {what} hissesini ekledin"
    if not qty:
        return f"{base}."
    return f"{base}: {qty} adet, tanesi {cost}." if cost else f"{base}: {qty} adet."


def _holding_bought(e: Entry, what: str) -> str:
    qty = _str(e["payload"].get("qty"))
    base = f"{_upper_first(what)} hissesini aldığını kaydettin"
    return f"{base}: {qty} adet." if qty else f"{base}."


def _import_applied(e: Entry, _what: str) -> str:
    n = _str(e["payload"].get("written"))
    return f"Dökümden {n} satırı deftere aktardın." if n else "Bir dökümü deftere aktardın."


def _holding_sold(e: Entry, what: str) -> str:
    qty = _str(e["payload"].get("qty"))
    base = f"{_upper_first(what)} hissesini sattığını kaydettin"
    return f"{base}: {qty} adet." if qty else f"{base}."


def _decided(e: Entry, what: str) -> str:
    rejected = e["payload"].get("decision") in ("reject", "rejected")
    return f"{what} önerisini reddettin." if rejected else f"{what} önerisini onayladın."


def _kill_on(e: Entry, _what: str) -> str:
    return "Her şeyi durdurdun." if is_person(e["actor"]) else "Paran zirvesinden %5 düştü; KAPtan her şeyi durdurdu."


def _verified(e: Entry, _what: str) -> str:
    if is_person(e["actor"]):
        return "Kayıtların sağlam olup olmadığına baktın."
    return "KAPtan gece kayıtları baştan sona kontrol etti."


def _expired(_e: Entry, what: str) -> str:
    if what == NO_COMPANY:
        return "Bir önerinin süresi doldu; karar vermedin."
    return f"{what} önerisinin süresi doldu; karar vermedin."


def _regime_changed(e: Entry, _what: str) -> str:
    to = e["payload"].get("to")
    if to == "crisis":
        return "Piyasa kriz günlerine girdi; yeni alımlar yarı tutarla yapılacak."
    return "Piyasa normale döndü." if to == "normal" else "Piyasanın durumu değişti."


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
    "approval.requested": lambda _e, what: f"KAPtan {what} için kararını bekliyor.",
    "approval.expired": _expired,
    "order.filled": _filled,
    "order.missed": lambda _e, _x: "İşlem gerçekleşmedi.",
    "order.refused": lambda _e, _x: "KAPtan işlemi kurallar yüzünden göndermedi.",
    "ticket.issued": _ticket_issued,
    "ticket.entered": lambda _e, _x: "İşlemi bankana girdiğini işaretledin.",
    "ticket.unfilled": lambda _e, _x: "İşlemin gerçekleşmediğini işaretledin.",
    "ticket.canceled": lambda _e, _x: "İşlemi girmediğini işaretledin.",
    "money.started": _money("Başlangıç paranı girdin"),
    "money.deposited": _money("Param’a para ekledin"),
    "money.withdrawn": _money("Param’dan para çektin"),
    "holding.added": _holding_added,
    "holding.sold": _holding_sold,
    "holding.bought": _holding_bought,
    "import.applied": _import_applied,
    "holding.corrected": lambda _e, what: f"{_upper_first(what)} hissesinin kaydını düzelttin.",
    "holding.undone": lambda _e, what: f"{_upper_first(what)} hissesini eklediğini geri aldın.",
    "money.corrected": _money_corrected,
    "money.undone": _money_undone,
    "ticket.corrected": lambda _e, _x: "İşlemin gerçekleşen kaydını düzelttin.",
    "book.reset": lambda _e, _x: "Baştan başladın; eski defterin Geçmiş'te duruyor.",
    "fee.changed": lambda _e, _x: "Bankanın komisyon oranını değiştirdin.",
    "dividend.recorded": lambda _e, what: f"{_upper_first(what)} kâr payı aldığını kaydettin.",
    "dividend.corrected": lambda _e, what: f"{_upper_first(what)} kâr payı kaydını geri aldın.",
    "bonus.recorded": lambda _e, what: f"{_upper_first(what)} için bedelsiz payların geldiğini kaydettin.",
    "bonus.corrected": lambda _e, what: f"{_upper_first(what)} bedelsiz pay kaydını geri aldın.",
    "rights.recorded": lambda _e, what: f"{_upper_first(what)} için bedelli pay aldığını kaydettin.",
    "rights.corrected": lambda _e, what: f"{_upper_first(what)} bedelli pay kaydını geri aldın.",
    "corporate.dismissed": lambda _e, _x: "Bir şirket duyurusunu kapattın.",
    "note.saved": lambda _e, what: f"{_upper_first(what)} için kendine not yazdın.",
    "note.cleared": lambda _e, what: f"{_upper_first(what)} için yazdığın notu sildin.",
    "concentration.threshold_set": lambda e, _x: (
        f"Tek hissede en çok tutmak istediğin payı %{e['payload'].get('threshold_pct', '')} yaptın."
    ),
    "kill_switch.on": _kill_on,
    "kill_switch.reset_started": lambda _e, _x: "Yeniden başlatmayı istedin.",
    "kill_switch.reset": lambda _e, _x: "İşlemleri yeniden başlattın.",
    "auth.login_failed": lambda _e, _x: "Yanlış parolayla giriş denendi.",
    "auth.login": lambda _e, _x: "Giriş yaptın.",
    "auth.logout": lambda _e, _x: "Çıkış yaptın.",
    "auth.single_user_waiver": lambda _e, _x: "Tek başına onayladın; bu da kayda geçti.",
    "auth.password_changed": lambda _e, _x: "Parolanı değiştirdin.",
    "auth.password_change_failed": lambda _e, _x: "Parola değiştirilmek istendi ama şimdiki parola yanlış girildi.",
    "auth.signed_out_everywhere": lambda _e, _x: "Her yerden çıkış yaptın.",
    "preferences.paused": lambda _e, _x: "Öneri getirmeye ara verdin.",
    "preferences.resumed": lambda _e, _x: "Aranı bitirdin; KAPtan yeniden öneri getiriyor.",
    "preferences.alerts_changed": lambda _e, _x: "Bildirim ayarlarını değiştirdin.",
    "settings.reset": lambda _e, _x: "Ayarları varsayılana döndürdün.",
    "backup.requested": lambda _e, _x: "Hemen yedek alınmasını istedin.",
    "watchlist.added": lambda _e, what: f"{_upper_first(what)} şirketini izleme listene ekledin.",
    "watchlist.removed": lambda _e, what: f"{_upper_first(what)} şirketini izleme listenden çıkardın.",
    "kill_switch.wait_waived": lambda _e, _x: "Yeniden başlatma için beklemedin; bu da kayda geçti.",
    "suggestion.held": lambda _e, what: f"{what} için “Tut” dedin.",
    "suggestion.skipped": lambda _e, what: f"{what} önerisini geçtin.",
    "risk.halted": lambda _e, _x: "Paran bir günde %1 düştü; bugünlük yeni işlem durdu.",
    "risk.halt_cleared": lambda _e, _x: "Yeni gün başladı; günlük duraklama kalktı.",
    "risk.regime_changed": _regime_changed,
    "restricted.added": lambda _e, what: f"{_upper_first(what)} yasak listene girdi.",
    "restricted.removal_requested": lambda _e, what: f"{_upper_first(what)} için yasak listesinden çıkmayı istedin.",
    "restricted.removed": lambda _e, what: f"{_upper_first(what)} yasak listenden çıktı.",
    "limits.changed": lambda _e, _x: "Yeni sınır geçerli oldu.",
    "limits.proposed": lambda _e, _x: "Bir sınırı değiştirmek istedin.",
    "limits.approved": lambda _e, _x: "Sınır değişikliğini onayladın.",
    "limits.rejected": lambda _e, _x: "Sınır değişikliğinden vazgeçtin.",
    "note.added": lambda _e, _x: "Not ekledin.",
    "audit.verified": _verified,
    "audit.verify_failed": lambda _e, _x: "KAPtan kayıtlarda bir bozulma buldu.",
    "brief.generated": lambda _e, _x: "KAPtan sabah özetini hazırladı.",
    "system.bootstrap": lambda _e, _x: "KAPtan çalışmaya başladı.",
    # Written only by the test harness; an old ledger may still hold one, so it stays readable.
    "demo.injected": lambda _e, _x: "Sınama amaçlı bir olay eklendi.",
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
