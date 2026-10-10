import type { AuditEntry } from "@/lib/domain";
import { memberByUid, ROLE_LABEL } from "@/lib/domain/user";
import { actorParts } from "@/lib/actors";

/**
 * One audit record as one plain Turkish sentence ("Risk Sorumlusu ORNEK önerisini imzaladı.").
 * Shared by the Denetim timeline and the mock's search, so what you read is what you can find.
 */
const SCENARIO_TR: Readonly<Record<string, string>> = {
  e3_contract: "yeni iş (E3)",
  redteam_injection: "gizli talimat",
  restricted_r04: "tedbirli hisse",
  loss_simulation: "zarar simülasyonu",
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : typeof v === "number" ? String(v) : null;
}

/** The subject of a sentence: the role for a person ("Risk Sorumlusu"), the name otherwise. */
function subject(actor: string): string {
  const m = memberByUid(actor);
  return m ? ROLE_LABEL[m.role] : actorParts(actor).name;
}

type Phrase = (e: AuditEntry, who: string, what: string) => string;

const PHRASES: Readonly<Record<string, Phrase>> = {
  "disclosure.ingested": (_e, _w, what) => `Tayfa ${what} bildirimini okudu.`,
  "classification.done": () => "Sınıflandırıcı bir bildirimin türünü belirledi.",
  "pregate.decided": () => "Ön eleme bir bildirimi süzdü.",
  "agent.output": (_e, who) => `${who} notunu yazdı.`,
  "rule.decided": () => "Kural motoru eşikleri tarttı.",
  "risk.checked": () => "Risk kapısı bir öneriyi denetledi.",
  "risk.rejected": (_e, _w, what) => `Kurallar ${what} için öneriyi baştan reddetti (tedbirli hisse).`,
  "compliance.rejected": (_e, _w, what) => `Uyum ${what} bildirimindeki gizli talimatı yakaladı; öneri çıkmadı.`,
  "proposal.created": (_e, _w, what) => `Tayfa ${what} için öneri hazırladı.`,
  "approval.decided": (e, who, what) => (e.payload.decision === "reject" || e.payload.decision === "rejected" ? `${who} ${what} önerisini reddetti.` : `${who} ${what} önerisini imzaladı.`),
  "order.filled": (e) => `Paper emir doldu${str(e.payload.qty) ? `: ${str(e.payload.qty)} lot` : ""}.`,
  "ticket.issued": (_e, _w, what) => `${what} için emir fişi yazıldı.`,
  "ticket.entered": (_e, who) => `${who} emir fişini aracı kuruma girdi.`,
  "ticket.unfilled": (_e, who) => `${who} emir fişini “dolmadı” diye işaretledi.`,
  "ticket.canceled": (_e, who) => `${who} emir fişini iptal etti.`,
  "kill_switch.on": (e, who) => (e.actor === "system:risk_monitor" ? "Risk izleyici zirveden −%5’te her şeyi durdurdu." : `${who} her şeyi durdurdu.`),
  "kill_switch.reset_started": (_e, who) => `${who} yeniden başlatmayı başlattı (1/2).`,
  "kill_switch.reset": (_e, who) => `${who} yeniden başlatmayı onayladı (2/2).`,
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
  const what = (str(e.payload.company) ?? str(e.payload.ticker) ?? "bir şirket").replace(/\s+A\.Ş\.?$/u, "");
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
  const who = actorParts(e.actor);
  const hay = trLower([auditSentence(e), who.name, who.kind, e.action, e.entity_id, JSON.stringify(e.payload)].join(" "));
  return hay.includes(needle);
}
