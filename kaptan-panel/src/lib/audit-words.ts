import type { AuditEntry } from "@/lib/domain";
import { memberByUid, ROLE_LABEL } from "@/lib/domain/user";
import { actorParts } from "@/lib/actors";
import { findIssuer } from "@/mocks/issuers";
import { titleTr } from "@/components/story/turkish";

/**
 * One audit record as one plain Turkish sentence ("Risk Sorumlusu Örnek Enerji önerisini imzaladı.").
 * Shared by the Denetim timeline and the mock's search, so what you read is what you can find.
 */
const SCENARIO_TR: Readonly<Record<string, string>> = {
  e3_contract: "yeni iş",
  redteam_injection: "gizli talimat",
  restricted_r04: "tedbirli hisse",
  loss_simulation: "zarar simülasyonu",
};

/** What a single-user waiver signed twice (backend four_eyes flows). */
const WAIVER_FLOW: Readonly<Record<string, string>> = {
  kill_reset: "yeniden başlatmanın",
  limits: "sınır değişikliğinin",
  live_arm: "canlı modun",
  restricted_removal: "engel listesinden çıkarmanın",
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : typeof v === "number" ? String(v) : null;
}

/** The subject of a sentence: the role for a person ("Risk Sorumlusu"), the name otherwise. */
function subject(actor: string): string {
  const m = memberByUid(actor);
  return m ? ROLE_LABEL[m.role] : actorParts(actor).name;
}

const NO_COMPANY = "bir şirket";
const stripLegal = (name: string) => name.replace(/\s+A\.Ş\.?$/u, "");

/**
 * The company a record is about, as a reader would say it: the payload's name, or the
 * ticker resolved through the issuer list, title-cased ("Örnek Enerji"). A ticker nobody
 * knows stays a code (`code: true`) so the screen can set it as one.
 */
export function auditCompany(e: AuditEntry): { text: string; code: boolean } {
  const company = str(e.payload.company);
  if (company) return { text: titleTr(stripLegal(company)), code: false };
  const ticker = str(e.payload.ticker);
  if (!ticker) return { text: NO_COMPANY, code: false };
  const known = findIssuer(ticker);
  return known ? { text: titleTr(stripLegal(known.name)), code: false } : { text: ticker, code: true };
}

type Phrase = (e: AuditEntry, who: string, what: string) => string;

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
  R13: "ekip engel listesinde",
};

export function vetoReason(e: Pick<AuditEntry, "payload">): string | null {
  const reasons = Array.isArray(e.payload.reasons) ? e.payload.reasons : [];
  for (const r of reasons) {
    const code = typeof r === "string" ? /^(R\d{2})/.exec(r)?.[1] : undefined;
    if (code && VETO_REASON[code]) return VETO_REASON[code];
  }
  return null;
}

function filled(e: AuditEntry, what: string): string {
  const qty = str(e.payload.qty);
  const buy = qty ? `${qty} lot alış` : "alış";
  const line = what === NO_COMPANY ? buy : `${what} için ${buy}`;
  return `${line.charAt(0).toLocaleUpperCase("tr-TR")}${line.slice(1)} gerçekleşti (KAPtan hesabı).`;
}

/** The API's ticket.issued names no company (only qty/side): describe the slip instead. */
function ticketIssued(e: AuditEntry, what: string): string {
  if (what !== NO_COMPANY) return `${what} için emir fişi yazıldı.`;
  const qty = str(e.payload.qty);
  const side = e.payload.side === "sell" ? "satış" : e.payload.side === "buy" ? "alış" : null;
  if (!qty) return "Emir fişi yazıldı.";
  return `${qty} lotluk ${side ? `${side} ` : ""}emir fişi yazıldı.`;
}

const PHRASES: Readonly<Record<string, Phrase>> = {
  "disclosure.ingested": (_e, _w, what) => `KAP okuyucu ${what} bildirimini getirdi.`,
  "classification.done": () => "Sınıflandırıcı bir bildirimin türünü belirledi.",
  "pregate.decided": () => "Ön eleme bir bildirimi süzdü.",
  "agent.output": (_e, who) => `${who} notunu yazdı.`,
  "rule.decided": () => "Kural motoru eşikleri tarttı.",
  "risk.checked": () => "Risk kapısı bir öneriyi denetledi.",
  "risk.rejected": (e, _w, what) => {
    const why = vetoReason(e);
    return `Kurallar ${what} için öneriyi baştan reddetti${why ? ` (${why})` : ""}.`;
  },
  "compliance.rejected": (_e, _w, what) => `Uyum ${what} bildirimindeki gizli talimatı yakaladı; öneri çıkmadı.`,
  "proposal.created": (_e, _w, what) => `Tayfa ${what} için öneri hazırladı.`,
  "approval.decided": (e, who, what) => (e.payload.decision === "reject" || e.payload.decision === "rejected" ? `${who} ${what} önerisini reddetti.` : `${who} ${what} önerisini imzaladı.`),
  "order.filled": (e, _w, what) => filled(e, what),
  "ticket.issued": (e, _w, what) => ticketIssued(e, what),
  "ticket.entered": (_e, who) => `${who} emir fişini aracı kuruma girdi.`,
  "ticket.unfilled": (_e, who) => `${who} emir fişini “dolmadı” diye işaretledi.`,
  "ticket.canceled": (_e, who) => `${who} emir fişini iptal etti.`,
  "kill_switch.on": (e, who) => (e.actor === "system:risk_monitor" ? "Risk izleyici zirveden −%5’te her şeyi durdurdu." : `${who} her şeyi durdurdu.`),
  "kill_switch.reset_started": (_e, who) => `${who} yeniden başlatmayı başlattı (1/2).`,
  "kill_switch.reset": (_e, who) => `${who} yeniden başlatmayı onayladı (2/2).`,
  "auth.login_failed": () => "Hatalı parolayla bir giriş denendi.",
  "auth.login": (_e, who) => `${who} giriş yaptı.`,
  "auth.logout": (_e, who) => `${who} çıkış yaptı.`,
  "auth.single_user_waiver": (e) => `Tek kullanıcı modu: ${WAIVER_FLOW[str(e.payload.flow) ?? ""] ?? "iki imzalı adımın"} ikinci imzası aynı kişiden alındı.`,
  "suggestion.held": (_e, who, what) => `${who} ${what} için “Tut” dedi.`,
  "suggestion.skipped": (_e, who, what) => `${who} ${what} önerisini geçti.`,
  "risk.halted": () => "Günlük −%1 sınırı aşıldı: yeni emir durdu.",
  "limits.proposed": (_e, who) => `${who} bir sınır değişikliği önerdi (1/2).`,
  "limits.approved": (_e, who) => `${who} sınır değişikliğini onayladı (2/2).`,
  "limits.rejected": (_e, who) => `${who} sınır değişikliğini reddetti.`,
  "note.added": (_e, who) => `${who} not ekledi.`,
  "audit.verified": (e, who) => (e.actor.startsWith("system:") ? "Gece doğrulaması defteri baştan sona yürüdü." : `${who} defteri doğruladı.`),
  "brief.generated": () => "Sabah özeti hazırlandı.",
  "demo.injected": (e) => `Senaryo eklendi: ${SCENARIO_TR[str(e.payload.scenario) ?? e.entity_id] ?? "senaryo"}.`,
};

export function auditSentence(e: AuditEntry): string {
  const who = subject(e.actor);
  const what = auditCompany(e).text;
  const phrase = PHRASES[e.action];
  return phrase ? phrase(e, who, what) : `${who}: ${e.action}`;
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
