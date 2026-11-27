import type { AuditEntry } from "@/lib/domain";
import { actorParts, isPerson, SYSTEM } from "@/lib/actors";
import { titleTr } from "@/components/story/turkish";
import { fmtLira } from "@/lib/solo/words";

/**
 * One audit record as one plain Turkish sentence ("Koru Çelik önerisini onayladın.").
 * Shared by the Geçmiş timeline and the mock's search, so what you read is what you can find.
 */
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : typeof v === "number" ? String(v) : null;
}

const NO_COMPANY = "bir şirket";
const stripLegal = (name: string) => name.replace(/\s+A\.Ş\.?$/u, "");

/**
 * The company a record is about, as a reader would say it: the payload's name, title-cased
 * ("Koru Çelik"). A record with only a ticker stays a code (`code: true`) so the screen can set
 * it as one.
 */
export function auditCompany(e: AuditEntry): { text: string; code: boolean } {
  const company = str(e.payload.company);
  if (company) return { text: titleTr(stripLegal(company)), code: false };
  const ticker = str(e.payload.ticker);
  if (!ticker) return { text: NO_COMPANY, code: false };
  return { text: ticker, code: true };
}

type Phrase = (e: AuditEntry, what: string) => string;

/** Why the pre-gate vetoed, in words, by the first rule code in the payload's reasons (06 §10). */
const VETO_REASON: Readonly<Record<string, string>> = {
  R01: "her şey durdurulmuştu",
  R02: "günlük zarar sınırı",
  R03: "hisse izlenen evrenin dışında",
  R04: "tedbirli hisse",
  R09: "fiyat bandının dışında",
  R10: "kriz rejimi",
  R11: "kota ya da veri sorunu",
  R12: "yalnızca alım kuralı",
  R13: "yasak listende",
};

export function vetoReason(e: Pick<AuditEntry, "payload">): string | null {
  const reasons = Array.isArray(e.payload.reasons) ? e.payload.reasons : [];
  for (const r of reasons) {
    const code = typeof r === "string" ? /^(R\d{2})/.exec(r)?.[1] : undefined;
    if (code && VETO_REASON[code]) return VETO_REASON[code];
  }
  return null;
}

const upperFirst = (text: string) => `${text.charAt(0).toLocaleUpperCase("tr-TR")}${text.slice(1)}`;

function filled(e: AuditEntry, what: string): string {
  const qty = str(e.payload.qty);
  const side = e.payload.side === "sell" ? "satış" : "alış";
  const order = qty ? `${qty} adet ${side}` : side;
  const line = what === NO_COMPANY ? order : `${what} için ${order}`;
  return `${upperFirst(line)} gerçekleşti.`;
}

/** The API's ticket.issued names no company (only qty/side): describe the order instead. */
function ticketIssued(e: AuditEntry, what: string): string {
  if (what !== NO_COMPANY) return `${what} için bankana gireceğin işlem hazırlandı.`;
  const qty = str(e.payload.qty);
  const side = e.payload.side === "sell" ? "satış" : e.payload.side === "buy" ? "alış" : null;
  if (!qty) return "Bankana gireceğin işlem hazırlandı.";
  return `${qty} adetlik ${side ? `${side} ` : ""}işlem hazırlandı.`;
}

/** The payload's amount as "50.000 ₺" (kuruş only when there is one), or null when it is missing. */
function lira(v: unknown): string | null {
  return typeof v === "number" && Number.isFinite(v) ? fmtLira(v, !Number.isInteger(v)) : null;
}

/** "Başlangıç paranı girdin: 50.000 ₺." The amount is left out when the record has none. */
const moneyPhrase = (lead: string): Phrase => (e) => {
  const amount = lira(e.payload.amount_try);
  return amount ? `${lead}: ${amount}.` : `${lead}.`;
};

function moneyCorrected(e: AuditEntry): string {
  const old = lira(e.payload.old_amount_try);
  const next = lira(e.payload.new_amount_try);
  return old && next ? `Parayı düzelttin: ${old} yerine ${next}.` : "Bir para hareketini düzelttin.";
}

function moneyUndone(e: AuditEntry): string {
  const amount = lira(e.payload.amount_try);
  return amount ? `Bir para hareketini geri aldın: ${amount}.` : "Bir para hareketini geri aldın.";
}

function holdingAdded(e: AuditEntry, what: string): string {
  const qty = str(e.payload.qty);
  const cost = lira(e.payload.avg_cost);
  const base = `Elindeki ${what} hissesini ekledin`;
  if (!qty) return `${base}.`;
  return cost ? `${base}: ${qty} adet, tanesi ${cost}.` : `${base}: ${qty} adet.`;
}

function holdingSold(e: AuditEntry, what: string): string {
  const qty = str(e.payload.qty);
  const base = `${upperFirst(what)} hissesini sattığını kaydettin`;
  return qty ? `${base}: ${qty} adet.` : `${base}.`;
}

function holdingBought(e: AuditEntry, what: string): string {
  const qty = str(e.payload.qty);
  const base = `${upperFirst(what)} hissesini aldığını kaydettin`;
  return qty ? `${base}: ${qty} adet.` : `${base}.`;
}

function importApplied(e: AuditEntry): string {
  const n = str(e.payload.written);
  return n ? `Dökümden ${n} satırı deftere aktardın.` : "Bir dökümü deftere aktardın.";
}

function regimeChanged(e: AuditEntry): string {
  if (e.payload.to === "crisis") return "Piyasa kriz günlerine girdi; yeni alımlar yarı tutarla yapılacak.";
  if (e.payload.to === "normal") return "Piyasa normale döndü.";
  return "Piyasanın durumu değişti.";
}

const PHRASES: Readonly<Record<string, Phrase>> = {
  "disclosure.ingested": (_e, what) => `KAPtan ${what} bildirimini okudu.`,
  "classification.done": () => "KAPtan bir bildirimin türünü belirledi.",
  "pregate.decided": () => "KAPtan bir bildirimi eledi.",
  "agent.output": () => "KAPtan bir inceleme notu yazdı.",
  "rule.decided": () => "KAPtan kurallara baktı.",
  "risk.checked": () => "KAPtan bir öneriyi sınırlarla karşılaştırdı.",
  "risk.rejected": (e, what) => {
    const why = vetoReason(e);
    return `KAPtan ${what} için öneriyi baştan eledi${why ? ` (${why})` : ""}.`;
  },
  "compliance.rejected": (_e, what) => `KAPtan ${what} bildirimindeki gizli talimatı yakaladı; öneri çıkmadı.`,
  "proposal.created": (_e, what) => `KAPtan ${what} için öneri hazırladı.`,
  "approval.decided": (e, what) => (e.payload.decision === "reject" || e.payload.decision === "rejected" ? `${what} önerisini reddettin.` : `${what} önerisini onayladın.`),
  "approval.requested": (_e, what) => `KAPtan ${what} için kararını bekliyor.`,
  "approval.expired": (_e, what) => (what === NO_COMPANY ? "Bir önerinin süresi doldu; karar vermedin." : `${what} önerisinin süresi doldu; karar vermedin.`),
  "order.filled": (e, what) => filled(e, what),
  "order.missed": () => "İşlem gerçekleşmedi.",
  "order.refused": () => "KAPtan işlemi kurallar yüzünden göndermedi.",
  "ticket.issued": (e, what) => ticketIssued(e, what),
  "ticket.entered": () => "İşlemi bankana girdiğini işaretledin.",
  "ticket.unfilled": () => "İşlemin gerçekleşmediğini işaretledin.",
  "ticket.canceled": () => "İşlemi girmediğini işaretledin.",
  "money.started": moneyPhrase("Başlangıç paranı girdin"),
  "money.deposited": moneyPhrase("Param’a para ekledin"),
  "money.withdrawn": moneyPhrase("Param’dan para çektin"),
  "holding.added": (e, what) => holdingAdded(e, what),
  "holding.sold": (e, what) => holdingSold(e, what),
  "holding.bought": (e, what) => holdingBought(e, what),
  "import.applied": (e) => importApplied(e),
  "holding.corrected": (_e, what) => `${upperFirst(what)} hissesinin kaydını düzelttin.`,
  "holding.undone": (_e, what) => `${upperFirst(what)} hissesini eklediğini geri aldın.`,
  "money.corrected": (e) => moneyCorrected(e),
  "money.undone": (e) => moneyUndone(e),
  "ticket.corrected": () => "İşlemin gerçekleşen kaydını düzelttin.",
  "book.reset": () => "Baştan başladın; eski defterin Geçmiş'te duruyor.",
  "fee.changed": () => "Bankanın komisyon oranını değiştirdin.",
  "dividend.recorded": (_e, what) => `${upperFirst(what)} kâr payı aldığını kaydettin.`,
  "dividend.corrected": (_e, what) => `${upperFirst(what)} kâr payı kaydını geri aldın.`,
  "bonus.recorded": (_e, what) => `${upperFirst(what)} için bedelsiz payların geldiğini kaydettin.`,
  "bonus.corrected": (_e, what) => `${upperFirst(what)} bedelsiz pay kaydını geri aldın.`,
  "rights.recorded": (_e, what) => `${upperFirst(what)} için bedelli pay aldığını kaydettin.`,
  "rights.corrected": (_e, what) => `${upperFirst(what)} bedelli pay kaydını geri aldın.`,
  "corporate.dismissed": () => "Bir şirket duyurusunu kapattın.",
  "note.saved": (_e, what) => `${upperFirst(what)} için kendine not yazdın.`,
  "note.cleared": (_e, what) => `${upperFirst(what)} için yazdığın notu sildin.`,
  "concentration.threshold_set": (e) => `Tek hissede en çok tutmak istediğin payı %${String(e.payload.threshold_pct ?? "")} yaptın.`,
  "kill_switch.on": (e) => (isPerson(e.actor) ? "Her şeyi durdurdun." : "Paran zirvesinden %5 düştü; KAPtan her şeyi durdurdu."),
  "kill_switch.reset_started": () => "Yeniden başlatmayı istedin.",
  "kill_switch.reset": () => "İşlemleri yeniden başlattın.",
  "auth.login_failed": () => "Yanlış parolayla giriş denendi.",
  "auth.login": () => "Giriş yaptın.",
  "auth.logout": () => "Çıkış yaptın.",
  "auth.single_user_waiver": () => "Tek başına onayladın; bu da kayda geçti.",
  "auth.password_changed": () => "Parolanı değiştirdin.",
  "auth.password_change_failed": () => "Parola değiştirilmek istendi ama şimdiki parola yanlış girildi.",
  "auth.signed_out_everywhere": () => "Her yerden çıkış yaptın.",
  "preferences.paused": () => "Öneri getirmeye ara verdin.",
  "preferences.resumed": () => "Aranı bitirdin; KAPtan yeniden öneri getiriyor.",
  "preferences.alerts_changed": () => "Bildirim ayarlarını değiştirdin.",
  "settings.reset": () => "Ayarları varsayılana döndürdün.",
  "backup.requested": () => "Hemen yedek alınmasını istedin.",
  "watchlist.added": (_e, what) => `${upperFirst(what)} şirketini izleme listene ekledin.`,
  "watchlist.removed": (_e, what) => `${upperFirst(what)} şirketini izleme listenden çıkardın.`,
  "kill_switch.wait_waived": () => "Yeniden başlatma için beklemedin; bu da kayda geçti.",
  "suggestion.held": (_e, what) => `${what} için “Tut” dedin.`,
  "suggestion.skipped": (_e, what) => `${what} önerisini geçtin.`,
  "risk.halted": () => "Paran bir günde %1 düştü; bugünlük yeni işlem durdu.",
  "risk.halt_cleared": () => "Yeni gün başladı; günlük duraklama kalktı.",
  "risk.regime_changed": (e) => regimeChanged(e),
  "restricted.added": (_e, what) => `${upperFirst(what)} yasak listene girdi.`,
  "restricted.removal_requested": (_e, what) => `${upperFirst(what)} için yasak listesinden çıkmayı istedin.`,
  "restricted.removed": (_e, what) => `${upperFirst(what)} yasak listenden çıktı.`,
  "limits.changed": () => "Yeni sınır geçerli oldu.",
  "limits.proposed": () => "Bir sınırı değiştirmek istedin.",
  "limits.approved": () => "Sınır değişikliğini onayladın.",
  "limits.rejected": () => "Sınır değişikliğinden vazgeçtin.",
  "note.added": () => "Not ekledin.",
  "learn.rule_changed": (e) =>
    e.payload["applied"] ? "KAPtan geçmişten öğrenip bir kural eşiğini değiştirdi." : "KAPtan bir kural eşiğini değiştirmeyi önerdi.",
  "learn.rule_reverted": () => "KAPtan'ın değiştirdiği bir eşiği geri aldın.",
  "learn.settings_changed": (e) => (e.payload["auto_apply"] ? "Kendi kendine öğrenmeyi açtın." : "Kendi kendine öğrenmeyi kapattın."),
  "audit.verified": (e) => (isPerson(e.actor) ? "Kayıtların sağlam olup olmadığına baktın." : "KAPtan gece kayıtları baştan sona kontrol etti."),
  "audit.verify_failed": () => "KAPtan kayıtlarda bir bozulma buldu.",
  "brief.generated": () => "KAPtan sabah özetini hazırladı.",
  "system.bootstrap": () => "KAPtan çalışmaya başladı.",
  "demo.injected": () => "Sınama amaçlı bir olay eklendi.",
};

export function auditSentence(e: AuditEntry): string {
  const what = auditCompany(e).text;
  const phrase = PHRASES[e.action];
  if (phrase) return phrase(e, what);
  return isPerson(e.actor) ? "Bir işlem yaptın." : `${SYSTEM} bir işlem yaptı.`;
}

/** Turkish-aware lower case for search (İ → i, I → ı). */
export function trLower(text: string): string {
  return text.toLocaleLowerCase("tr-TR");
}

/** Does a record match a free-text search (its sentence, who did it, the raw fields)? */
export function auditMatches(e: AuditEntry, q: string): boolean {
  const needle = trLower(q.trim());
  if (!needle) return true;
  // "#3907" or "#3.907": the record at that place in the chain.
  const pos = /^#\s*([\d.]+)$/.exec(needle);
  if (pos) return e.chain_pos === Number((pos[1] ?? "").replace(/\./g, ""));
  const who = actorParts(e.actor);
  const hay = trLower([auditSentence(e), who.name, who.kind, e.action, e.entity_id, JSON.stringify(e.payload)].join(" "));
  return hay.includes(needle);
}
