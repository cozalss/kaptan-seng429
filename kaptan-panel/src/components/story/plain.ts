import type { ApprovalCard, EvidenceEvent, Explain, RuleTraceEntry } from "@/lib/domain";
import { fmtInt, fmtPct, fmtTime } from "@/lib/format";
import { fmtLira } from "@/lib/solo/words";
import { dayWordTr } from "@/lib/time";
import { dative, possessive, possessiveLocative, titleTr } from "./turkish";

/**
 * The panel speaks plain Turkish (SPEC §2): every number arrives inside a sentence a
 * non-expert reads in seconds. Pure functions over the API types; the screens only lay them out.
 */
type Card = Pick<ApprovalCard, "event_type" | "sub_type_tr" | "headline_tr" | "rule_trace_summary">;

/** The first rule of the event's own family (E3.materiality for an E3 card). */
export function mainRule(card: Pick<ApprovalCard, "event_type" | "rule_trace_summary">): RuleTraceEntry | null {
  return card.rule_trace_summary.find((r) => r.rule.startsWith(`${card.event_type}.`)) ?? null;
}

/** What happened, in one sentence: "Yıllık gelirinin %18'i kadar yeni iş aldı." */
export function plainEvent(card: Card & Partial<Pick<ApprovalCard, "side">>): string {
  // A sell is an exit (X1–X4): say why the position closes, not the event that opened it.
  if (card.side === "sell") return card.headline_tr;
  const obs = mainRule(card)?.observed ?? null;
  const pct = obs && /%/.test(obs) ? obs : null;
  switch (card.event_type) {
    case "E1":
      return pct ? `Son 10 borsa gününde sermayesinin ${possessive(pct)} kadar kendi hissesini geri aldı.` : "Kendi hissesini borsadan geri aldı.";
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

const lowerFirst = (t: string) => t.charAt(0).toLocaleLowerCase("tr-TR") + t.slice(1);

/**
 * What follows the big verb on the "Neden?" page: "Koru Çelik hissesi, çünkü şirket son 10 borsa
 * gününde sermayesinin %0,31’i kadar kendi hissesini geri aldı."
 */
export function reasonSentence(card: Card & Pick<ApprovalCard, "side" | "company_name">): string {
  const name = titleTr(shortName(card.company_name));
  const possessor = card.event_type === "E2" || card.event_type === "E4";
  const subject = card.side === "sell" ? "" : possessor ? "şirketin " : "şirket ";
  return `${name} hissesi, çünkü ${subject}${lowerFirst(plainEvent(card))}`;
}

const WHY: Readonly<Record<string, string>> = {
  E1: "Şirket kendi hissesini yeterince geri alınca, geçmişte hisse çoğu zaman toparlandı.",
  E2: "İçeriden biri kendi cebinden hisse alınca, bu genelde şirkete güvenin işaretidir.",
  E3: "Gelirine göre büyük, bağlayıcı yeni bir iş fiyata birkaç gün içinde yansıyabilir.",
  E4: "Kâr beklentiyi belirgin aşınca, fiyat bunu birkaç günde sindirir.",
};

const MEASURE: Readonly<Record<string, string>> = {
  E1: "Geri alımda",
  E2: "Alımda",
  E3: "Büyüklükte",
  E4: "Kâr sürprizinde",
};

/** Why it matters: the rule that fired, in words, plus what it looks for and what was seen. */
const BARE_FIGURE = /^[≥≤<>\s]*[\d.,]+\s*$/;

export function plainWhy(card: Card): string {
  const rule = mainRule(card);
  const lead = WHY[card.event_type] ?? "Bu olay türü kurallarımızdan birine uyuyor.";
  if (!rule?.threshold || !rule.observed) return lead;
  // "En az 1,0 arıyor" tells nobody anything: a figure with no unit is said in words.
  if (BARE_FIGURE.test(rule.threshold)) return rule.passed ? `${lead} Bu olay, KAPtan’ın aradığı ölçüyü geçiyor.` : lead;
  return `${lead} ${MEASURE[card.event_type] ?? "Kuralda"} KAPtan ${rule.threshold.replace(/^≥\s*/, "en az ")} arıyor; bu olayda ${rule.observed}.`;
}

/** How many past cases beat the market in 5 days, read off the events when all of them are at hand. */
export function pastWins(e: ApprovalCard["evidence_summary"], events?: ReadonlyArray<Pick<EvidenceEvent, "car_5d">>): number {
  return events && events.length === e.n ? events.filter((x) => x.car_5d > 0).length : Math.round(e.hit_rate_5d * e.n);
}

/**
 * "Benzer 12 olayın 7’sinde hisse 5 gün içinde piyasadan iyi gitti." The figures measure the stock
 * against the market, so the sentence says that, never "yükseldi".
 */
export function plainHistory(e: ApprovalCard["evidence_summary"], events?: ReadonlyArray<Pick<EvidenceEvent, "car_5d">>): string {
  if (e.n === 0) return "Geçmişte buna benzer olay bulunamadı.";
  const wins = pastWins(e, events);
  if (wins === 0) return `Benzer ${fmtInt(e.n)} olayın hiçbirinde hisse 5 gün içinde piyasadan iyi gitmedi.`;
  return `Benzer ${fmtInt(e.n)} olayın ${possessiveLocative(fmtInt(wins))} hisse 5 gün içinde piyasadan iyi gitti.`;
}

/** How much the sample can carry, in words. The steps are the evidence rule's own (≥15, 8–14, 5–7, <5). */
export function sampleWords(n: number): string {
  if (n === 0) return "Geçmişte benzer olay yok; KAPtan burada geçmişe dayanamıyor.";
  if (n < 5) return `Yalnızca ${fmtInt(n)} benzer olay var. Bu çok az; fazla güvenme.`;
  if (n < 8) return `${fmtInt(n)} benzer olay var. Bu az; temkinli oku.`;
  if (n < 15) return `${fmtInt(n)} benzer olay var. Bu orta bir sayı; kesin bir şey söylemez.`;
  return `${fmtInt(n)} benzer olay var. Bu iyi bir sayı, yine de kesin bir şey söylemez.`;
}

/** The middle case, in words: what a typical past case did against the market. */
export function middleCaseWords(median: number): string {
  if (median === 0) return "Ortadaki olayda hisse 5 günde piyasayla aynı gitti.";
  return `Ortadaki olayda hisse 5 günde piyasadan ${fmtPct(Math.abs(median), 1)} ${median > 0 ? "iyi" : "kötü"} gitti.`;
}

/** Said under every past-case figure. No promises. */
export const NO_PROMISE = "Geçmiş, geleceğin sözü değildir. Bu kez kazanç sıfır da olabilir, zarar da.";

/** Until when an open suggestion can be answered: "Bugün 17:30’a kadar cevap ver." Null when it has no deadline. */
export function answerByLine(expiresAt: string | null, nowMs: number | null): string | null {
  if (!expiresAt) return null;
  const at = dative(fmtTime(expiresAt));
  if (nowMs === null) return `${at} kadar cevap ver.`;
  if (Date.parse(expiresAt) <= nowMs) return "Cevap süresi doldu.";
  const day = dayWordTr(expiresAt, new Date(nowMs).toISOString());
  return `${day.charAt(0).toLocaleUpperCase("tr-TR")}${day.slice(1)} ${at} kadar cevap ver.`;
}

/** "a, b ve c" */
export function listTr(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} ve ${parts[parts.length - 1]}`;
}

/* ── the eight steps, one question and one line each ───────────────────── */
export interface CrewLine {
  agent: "classifier" | "reader" | "materiality" | "evidence" | "skeptic" | "compliance" | "rule_engine" | "risk_gate";
  /** What this step asks, in words anyone gets. The step's internal name never reaches the screen. */
  question: string;
  text: string;
  /** This step changed the amount (the counter-argument shrank it, the money limits capped it). */
  changed: boolean;
}

const QUESTION: Readonly<Record<CrewLine["agent"], string>> = {
  classifier: "Bu ne tür bir haber?",
  reader: "Metinde ne yazıyor?",
  materiality: "Şirket için büyük bir şey mi?",
  evidence: "Daha önce benzeri oldu mu?",
  skeptic: "Karşı görüş ne diyor?",
  compliance: "Bir yasak ya da tuzak var mı?",
  rule_engine: "Kurallara uyuyor mu?",
  risk_gate: "Para sınırlarını aşıyor mu?",
};

const SHRINK: Readonly<Record<number, string>> = {
  1: "Tutara dokunmadı.",
  0.75: "Tutarı dörtte bir azalttı.",
  0.5: "Tutarı yarıya indirdi.",
  0.25: "Tutarı dörtte bire indirdi.",
};

/** The same shrink, as the verb in a longer sentence ("karşı görüş dörtte bir azalttı"). */
const SHRINK_VERB: Readonly<Record<number, string>> = {
  0.75: "dörtte bir azalttı",
  0.5: "yarıya indirdi",
  0.25: "dörtte bire indirdi",
};

/** The condition each event family has to meet, in words (never the E-code). */
const CONDITION: Readonly<Record<string, string>> = {
  E1: "geri alım",
  E2: "içeriden alım",
  E3: "yeni iş",
  E4: "kâr sürprizi",
};

/** What the size check weighed, in the event's own terms. */
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

/** "Kârın bir kısmı …" → "kârın bir kısmı ….": a clause after a colon, ending in a full stop. */
function asClause(text: string): string {
  const lowered = lowerFirst(text.trim());
  return /[.!?]$/.test(lowered) ? lowered : `${lowered}.`;
}

const isFlagged = (card: Pick<ApprovalCard, "compliance_summary_tr">, e: Explain | null) => e?.compliance?.decision === "escalate" || card.compliance_summary_tr.includes("inceleme");

/** The one point KAPtan wants a person to look at, or null when it flagged nothing. */
export function lookHere(card: Pick<ApprovalCard, "compliance_summary_tr">, e: Explain | null): string | null {
  if (!isFlagged(card, e)) return null;
  const point = e?.compliance?.checks.find((c) => c.result === "escalate")?.detail_tr;
  return point ? `KAPtan’ın senin bakmanı istediği nokta: ${asClause(point)}` : "KAPtan bir noktayı senin bakman için işaretledi.";
}

const NO_BAN = "Bu hisseye konmuş bir borsa yasağı yok";

function complianceLine(card: ApprovalCard, e: Explain | null): string {
  const look = lookHere(card, e);
  return look ? `${NO_BAN}. ${look}` : `${NO_BAN}; metinde KAPtan'ı yanıltmaya çalışan bir şey de yok.`;
}

/** The counter-argument as said on screen: the step's internal name stays out of it. */
export function counterNote(card: Pick<ApprovalCard, "skeptic_note_tr">): string {
  return card.skeptic_note_tr.replace(/^Şüpheci\b/u, "Karşı görüş");
}

/** How much the counter-argument cut the amount, as a sentence; null when it did not. */
export function shrinkSentence(multiplier: number): string | null {
  const said = SHRINK_VERB[multiplier];
  return said ? `KAPtan bu yüzden tutarı ${said}.` : null;
}

export function crewLines(card: ApprovalCard, e: Explain | null): CrewLine[] {
  const conf = e?.classifier ? ` (%${Math.round(e.classifier.confidence * 100)} emin)` : "";
  const amount = e?.merged?.amount_try ?? null;
  const rule = mainRule(card);
  const passed = card.rule_trace_summary.filter((t) => t.passed).length;
  const risk = e?.risk_checks ?? [];
  const riskPassed = risk.filter((r) => r.outcome !== "reject").length;
  const shrunk = card.final_notional_try < card.requested_notional_try;
  const condition = CONDITION[card.event_type] ?? "olay";
  const line = (agent: CrewLine["agent"], text: string, changed = false): CrewLine => ({ agent, question: QUESTION[agent], text, changed });
  return [
    line("classifier", `Bunu “${card.sub_type_tr.toLocaleLowerCase("tr-TR")}” olarak tanıdı${conf}.`),
    line("reader", amount ? `Metindeki tutarı okudu: ${fmtLira(amount)}. Rakamı metinle karşılaştırdı, tuttu.` : "Metindeki rakamları ve tarafları çıkardı."),
    line("materiality", materialityLine(card.event_type, rule?.observed ?? null)),
    line("evidence", `Geçmişte ${fmtInt(card.evidence_summary.n)} benzer olay buldu, sonuçlarına bakmadan seçti.`),
    line("skeptic", `${firstSentence(counterNote(card))}. ${SHRINK[card.size_multiplier] ?? ""}`.trim(), card.size_multiplier < 1),
    line("compliance", complianceLine(card, e)),
    line("rule_engine", `${passed}/${card.rule_trace_summary.length} kural geçti; ${condition} şartı sağlandı.`),
    line(
      "risk_gate",
      `${risk.length ? `${riskPassed}/${risk.length} para sınırı kontrolü geçti. ` : ""}${shrunk ? `Tutarı ${fmtLira(card.final_notional_try)} ile sınırladı.` : `Tutar: ${fmtLira(card.final_notional_try)}.`}`,
      shrunk,
    ),
  ];
}

/**
 * The work in one sentence, on the collapsed row: "KAPtan 8 adımda inceledi; 2’si tutarı
 * değiştirdi: karşı görüş dörtte bir azalttı, para sınırları 43.495 ₺ ile sınırladı."
 */
export function crewLead(lines: readonly CrewLine[], card: Pick<ApprovalCard, "size_multiplier" | "final_notional_try">): string {
  const changed = lines.filter((l) => l.changed);
  const head = `KAPtan ${fmtInt(lines.length)} adımda inceledi`;
  if (!changed.length) return `${head}; tutar değişmedi.`;
  const what = changed.map((l) => (l.agent === "skeptic" ? `karşı görüş ${SHRINK_VERB[card.size_multiplier] ?? "tutarı küçülttü"}` : `para sınırları ${fmtLira(card.final_notional_try)} ile sınırladı`));
  return `${head}; ${possessive(fmtInt(changed.length))} tutarı değiştirdi: ${what.join(", ")}.`;
}

/* ── risk ──────────────────────────────────────────────────────────────── */
export interface RiskView {
  stopPrice: number;
  stopPct: number;
  maxLoss: number;
}

/** Stop level and the loss at the stop, from the proposal behind the card. */
export function riskView(card: Pick<ApprovalCard, "qty" | "limit_price">, stopPrice: number | null | undefined): RiskView | null {
  if (!stopPrice || stopPrice >= card.limit_price) return null;
  return { stopPrice, stopPct: stopPrice / card.limit_price - 1, maxLoss: Math.round(card.qty * (card.limit_price - stopPrice)) };
}

/**
 * The risk in plain words: "Fiyat 70,06 ₺’ya düşerse satman gerekir; o noktada kaybın yaklaşık
 * 4.262 ₺ olur." The stop is a plan, not a wall, so the sentence says the loss can be bigger. The
 * comparison with the per-trade limit needs the limit and the money's size; without them it is left out.
 */
export function riskSentence(risk: RiskView, limit: { pct: number; equity: number } | null): string {
  const first = `Fiyat ${fmtLira(risk.stopPrice, true)}’ya düşerse satman gerekir; o noktada kaybın yaklaşık ${fmtLira(risk.maxLoss)} olur. Fiyat bir anda sert düşerse kayıp bundan büyük olabilir.`;
  if (!limit || limit.pct <= 0 || limit.equity <= 0) return first;
  const cap = limit.equity * limit.pct;
  return `${first} Bu tutar, tek işlemde kabul ettiğin kayıp sınırının (yaklaşık ${fmtLira(cap)}) ${risk.maxLoss <= cap ? "altında" : "üstünde"}.`;
}

/**
 * The disclosure's most telling sentence, for the quote: the first sentence after the title that
 * carries a figure (a digit, % or TL); else the first sentence of the second paragraph; null when
 * the text has neither.
 */
export function disclosureQuote(body: string | undefined): string | null {
  if (!body) return null;
  const paragraphs = body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(1);
  const sentences = paragraphs.flatMap((p) => p.split(/(?<=[.!?])\s+/));
  const pick = sentences.find((s) => /\d|%|\bTL\b/.test(s)) ?? (paragraphs[0] ? (paragraphs[0].split(/(?<=[.!?])\s+/)[0] ?? null) : null);
  if (!pick) return null;
  return pick.length > 260 ? `${pick.slice(0, 257).trimEnd()}…` : pick;
}

/** The company's name without the legal suffix ("KORU ÇELİK A.Ş." → "KORU ÇELİK"). */
export function shortName(name: string): string {
  return name.replace(/\s+(A\.Ş\.|T\.A\.Ş\.|SANAYİ VE TİCARET A\.Ş\.)$/u, "").trim();
}

/** The disclosure's address on KAP, when it has a real one: a record marked as a fixture has nothing to link to. */
export function realDisclosureUrl(card: Pick<ApprovalCard, "disclosure_url" | "is_fixture">): string | null {
  if (card.is_fixture) return null;
  return /^https:\/\/([a-z0-9-]+\.)*kap\.org\.tr\//i.test(card.disclosure_url) ? card.disclosure_url : null;
}
