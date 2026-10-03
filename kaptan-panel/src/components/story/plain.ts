import type { ApprovalCard, DayCounters, Explain, RuleTraceEntry } from "@/lib/domain";
import { fmtInt, fmtPct, fmtPrice, fmtSignedPct, fmtTime, fmtTry } from "@/lib/format";
import { dative, locative, possessive, possessiveLocative } from "./turkish";

/**
 * The panel speaks plain Turkish (PERSONAL-SPEC §2): every number arrives inside a sentence a
 * non-expert reads in seconds. Pure functions over the API types; the screens only lay them out.
 */
type Card = Pick<ApprovalCard, "event_type" | "sub_type_tr" | "headline_tr" | "rule_trace_summary">;

/** The first rule of the event's own family (E3.materiality for an E3 card). */
export function mainRule(card: Pick<ApprovalCard, "event_type" | "rule_trace_summary">): RuleTraceEntry | null {
  return card.rule_trace_summary.find((r) => r.rule.startsWith(`${card.event_type}.`)) ?? null;
}

/** What happened, in one sentence: "Yıllık gelirinin %18'i kadar yeni iş aldı." */
export function plainEvent(card: Card): string {
  const obs = mainRule(card)?.observed ?? null;
  const pct = obs && /%/.test(obs) ? obs : null;
  switch (card.event_type) {
    case "E1":
      return pct ? `Son 10 seansta sermayesinin ${possessive(pct)} kadar kendi hissesini geri aldı.` : "Kendi hissesini borsadan geri aldı.";
    case "E2":
      return /ana ortak/i.test(card.sub_type_tr) ? "Ana ortağı borsadan kendi hissesini aldı." : "Bir yöneticisi borsadan kendi parasıyla hisse aldı.";
    case "E3":
      return pct ? `Yıllık gelirinin ${possessive(pct)} kadar yeni iş aldı.` : "Büyük ve bağlayıcı yeni bir iş aldı.";
    case "E4":
      return "Kârı beklentinin belirgin biçimde üstünde geldi.";
    default:
      return card.headline_tr;
  }
}

const WHY: Readonly<Record<string, string>> = {
  E1: "Şirket kendi hissesini yeterince geri alınca, geçmişte hisse çoğu zaman toparlandı.",
  E2: "İçeriden biri kendi cebinden hisse alınca, bu genelde şirkete güvenin işaretidir.",
  E3: "Gelirine göre büyük, bağlayıcı yeni bir iş fiyata birkaç gün içinde yansıyabilir.",
  E4: "Kâr beklentiyi belirgin aşınca, fiyat bunu birkaç günde sindirir.",
};

const MEASURE: Readonly<Record<string, string>> = {
  E1: "Geri alım için",
  E2: "Alım için",
  E3: "Büyüklük için",
  E4: "Kâr sürprizi için",
};

/** Why it matters: the rule that fired, in words, plus its threshold and what was seen. */
export function plainWhy(card: Card): string {
  const rule = mainRule(card);
  const lead = WHY[card.event_type] ?? "Bu olay türü kurallarımızdan birine uyuyor.";
  if (!rule?.threshold || !rule.observed) return lead;
  return `${lead} ${MEASURE[card.event_type] ?? "Kuralın"} eşiği ${rule.threshold}; bu olayda ${rule.observed}.`;
}

/** "3/3 kural ve 16 risk kontrolü geçti." style tally of the card's rule trace. */
export function ruleTally(trace: readonly RuleTraceEntry[]): { passed: number; total: number } {
  return { passed: trace.filter((t) => t.passed).length, total: trace.length };
}

/** "Benzer 23 olayın %61'inde hisse 5 gün içinde yükseldi (ortanca +%1,1)." */
export function plainHistory(e: ApprovalCard["evidence_summary"]): string {
  if (e.n === 0) return "Geçmişte buna benzer olay bulunamadı.";
  const hit = fmtPct(e.hit_rate_5d, 0);
  return `Benzer ${fmtInt(e.n)} olayın ${possessiveLocative(hit)} hisse 5 gün içinde yükseldi (ortanca ${fmtSignedPct(e.median_car_5d)}).`;
}

/** "620 lot · en fazla 48,40 TL" */
export function suggestionLine(card: Pick<ApprovalCard, "qty" | "limit_price">): string {
  return `${fmtInt(card.qty)} lot · en fazla ${fmtPrice(card.limit_price)}`;
}

/** "5 gün tut" / "20–40 gün tut" */
export function holdLine(card: Pick<ApprovalCard, "holding_days">): string {
  const [a, b] = card.holding_days;
  return a === b ? `${a} gün tut` : `${a}–${b} gün tut`;
}

/** "Karar için 09:50'ye 20 sa var." — rounded to whole hours, minutes in the last hour. */
export function deadlineLine(expiresAt: string, nowMs: number | null): string {
  const at = fmtTime(expiresAt);
  if (nowMs === null) return `Karar için son saat ${at}.`;
  const ms = Date.parse(expiresAt) - nowMs;
  if (ms <= 0) return `Karar süresi ${locative(at)} doldu.`;
  const h = Math.floor(ms / 3_600_000);
  const left = h >= 1 ? `${h} sa` : `${Math.max(1, Math.ceil(ms / 60_000))} dk`;
  return `Karar için ${dative(at)} ${left} var.`;
}

/** The one big sentence on Bugün. */
export function todayHeadline(count: number, stopped: boolean): string {
  if (stopped) return "Durdurdun — yeni öneri gelmez.";
  if (count === 0) return "Bugün öneri yok — tayfa izliyor.";
  return `Bugün ${fmtInt(count)} öneri var.`;
}

/** What the crew did today, in one quiet sentence. */
export function crewDayLine(c: Pick<DayCounters, "total" | "processed" | "proposals"> | null): string | null {
  if (!c) return null;
  if (c.total === 0) return "Tayfa bugün henüz bildirim okumadı.";
  return `Tayfa bugün ${fmtInt(c.total)} bildirim okudu, ${fmtInt(c.processed)} tanesini inceledi, ${fmtInt(c.proposals)} öneri çıkardı.`;
}

/* ── the eight crew members, one line each ─────────────────────────────── */
export interface CrewLine {
  agent: "classifier" | "reader" | "materiality" | "evidence" | "skeptic" | "compliance" | "rule_engine" | "risk_gate";
  text: string;
}

const SHRINK: Readonly<Record<number, string>> = {
  1: "Tutara dokunmadı.",
  0.75: "Tutarı dörtte bir azalttı.",
  0.5: "Tutarı yarıya indirdi.",
  0.25: "Tutarı dörtte bire indirdi.",
};

/** What Önemlilik weighed, in the event's own terms. */
export function materialityLine(event: ApprovalCard["event_type"], observed: string | null): string {
  const pct = observed && /%/.test(observed) ? observed : null;
  if (event === "E3" && pct) return `Tutarı şirketin yıllık geliriyle tarttı: gelirin ${possessive(pct)}.`;
  if (event === "E1" && pct) return `Geri alınan payı sermayeyle tarttı: sermayenin ${possessive(pct)}.`;
  if (event === "E4" && observed) return `Kârı beklentiyle kıyasladı: sürpriz ölçüsü ${observed}.`;
  return "Olayı şirketin büyüklüğüyle karşılaştırdı.";
}

/** First sentence of a free-text note, without a trailing period. */
function firstSentence(text: string): string {
  const s = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return s.replace(/[.\s]+$/, "");
}

export function crewLines(card: ApprovalCard, e: Explain | null): CrewLine[] {
  const conf = e?.classifier ? ` (%${Math.round(e.classifier.confidence * 100)} emin)` : "";
  const amount = e?.merged?.amount_try ?? null;
  const rule = mainRule(card);
  const tally = ruleTally(card.rule_trace_summary);
  const risk = e?.risk_checks ?? [];
  const riskPassed = risk.filter((r) => r.outcome !== "reject").length;
  const shrunk = card.final_notional_try < card.requested_notional_try;
  const flagged = e?.compliance?.decision === "escalate" || card.compliance_summary_tr.includes("inceleme");
  return [
    { agent: "classifier", text: `Bunu “${card.sub_type_tr.toLocaleLowerCase("tr-TR")}” olarak tanıdı${conf}.` },
    {
      agent: "reader",
      text: amount ? `Metindeki tutarı okudu: ${fmtTry(amount)}. Rakamı metinle karşılaştırdı, tuttu.` : "Metindeki rakamları ve tarafları çıkardı.",
    },
    { agent: "materiality", text: materialityLine(card.event_type, rule?.observed ?? null) },
    { agent: "evidence", text: `Geçmişte ${fmtInt(card.evidence_summary.n)} benzer olay buldu, sonuçlarına bakmadan seçti.` },
    { agent: "skeptic", text: `${firstSentence(card.skeptic_note_tr)}. ${SHRINK[card.size_multiplier] ?? ""}`.trim() },
    { agent: "compliance", text: flagged ? "Tedbir yok; bir noktayı senin bakman için işaretledi." : "Tedbir yok, metinde gizli talimat yok." },
    { agent: "rule_engine", text: `${tally.passed}/${tally.total} kural geçti; ${card.event_type} şartı sağlandı.` },
    {
      agent: "risk_gate",
      text: `${risk.length ? `${riskPassed}/${risk.length} risk kontrolü geçti. ` : ""}${shrunk ? `Tutarı ${fmtTry(card.final_notional_try)} ile sınırladı.` : `Tutar: ${fmtTry(card.final_notional_try)}.`}`,
    },
  ];
}

/* ── risk ──────────────────────────────────────────────────────────────── */
export interface RiskView {
  stopPrice: number;
  stopPct: number;
  maxLoss: number;
}

/** Stop level and the worst loss at the stop, from the proposal behind the card. */
export function riskView(card: Pick<ApprovalCard, "qty" | "limit_price">, stopPrice: number | null | undefined): RiskView | null {
  if (!stopPrice || stopPrice >= card.limit_price) return null;
  return { stopPrice, stopPct: stopPrice / card.limit_price - 1, maxLoss: Math.round(card.qty * (card.limit_price - stopPrice)) };
}

/** The company's name without the legal suffix ("ÖRNEK ENERJİ A.Ş." → "ÖRNEK ENERJİ"). */
export function shortName(name: string): string {
  return name.replace(/\s+(A\.Ş\.|T\.A\.Ş\.|SANAYİ VE TİCARET A\.Ş\.)$/u, "").trim();
}
