import type { ApprovalCard, DayCounters, EvidenceEvent, Explain, RuleTraceEntry } from "@/lib/domain";
import { crewByAgent } from "@/lib/crew";
import { fmtInt, fmtPct, fmtPrice, fmtTime, fmtTry } from "@/lib/format";
import { dayWordTr, fmtCountdown } from "@/lib/time";
import { dative, locative, possessive, possessiveLocative } from "./turkish";

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

/**
 * "Benzer 12 olayın 7’sinde hisse 5 gün içinde yükseldi." The count is read off the events
 * themselves when every one is at hand (so the sentence and the strip under it agree);
 * otherwise from the card's hit rate.
 */
export function plainHistory(e: ApprovalCard["evidence_summary"], events?: ReadonlyArray<Pick<EvidenceEvent, "car_5d">>): string {
  if (e.n === 0) return "Geçmişte buna benzer olay bulunamadı.";
  const rose = events && events.length === e.n ? events.filter((x) => x.car_5d > 0).length : Math.round(e.hit_rate_5d * e.n);
  if (rose === 0) return `Benzer ${fmtInt(e.n)} olayın hiçbirinde hisse 5 gün içinde yükselmedi.`;
  return `Benzer ${fmtInt(e.n)} olayın ${possessiveLocative(fmtInt(rose))} hisse 5 gün içinde yükseldi.`;
}

/** "560 lot al · tanesi en fazla 77,67 TL" */
export function suggestionLine(card: Pick<ApprovalCard, "qty" | "limit_price">): string {
  return `${fmtInt(card.qty)} lot al · tanesi en fazla ${fmtPrice(card.limit_price)}`;
}

/** "5 gün tut" / "20–40 gün tut" */
export function holdLine(card: Pick<ApprovalCard, "holding_days">): string {
  const [a, b] = card.holding_days;
  return a === b ? `${a} gün tut` : `${a}–${b} gün tut`;
}

/** The proposal in one plain line: "Öneri: 560 lot al, tanesi en fazla 77,67 TL — toplam ≈ 43.495 TL. 5–10 gün tut." */
export function proposalLine(card: Pick<ApprovalCard, "qty" | "limit_price" | "final_notional_try" | "holding_days">): string {
  return `Öneri: ${fmtInt(card.qty)} lot al, tanesi en fazla ${fmtPrice(card.limit_price)} — toplam ≈ ${fmtTry(card.final_notional_try)}. ${holdLine(card)}.`;
}

/** A Bugün card's footer: "560 lot al · tanesi en fazla 77,67 TL · yarın 09:50’ye kadar". */
export function cardFooterLine(card: Pick<ApprovalCard, "qty" | "limit_price" | "expires_at">, nowIso: string | null): string {
  const at = dative(fmtTime(card.expires_at));
  const when = nowIso ? `${dayWordTr(card.expires_at, nowIso)} ${at}` : at;
  return `${suggestionLine(card)} · ${when} kadar`;
}

/**
 * Under the decision: "Portföyün %4,3’ü · karar için son saat yarın 09:50 (20 saat kaldı)".
 * The share is left out until the portfolio is known; the countdown until the clock is.
 */
export function decisionMetaLine(card: Pick<ApprovalCard, "final_notional_try" | "expires_at">, equity: number | null, nowMs: number | null): string {
  const share = equity ? `Portföyün ${possessive(fmtPct(card.final_notional_try / equity, 1))}` : null;
  const at = fmtTime(card.expires_at);
  const deadline =
    nowMs === null
      ? `karar için son saat ${at}`
      : Date.parse(card.expires_at) <= nowMs
        ? `karar süresi ${locative(at)} doldu`
        : `karar için son saat ${dayWordTr(card.expires_at, new Date(nowMs).toISOString())} ${at} (${fmtCountdown(Date.parse(card.expires_at) - nowMs)} kaldı)`;
  const line = share ? `${share} · ${deadline}` : deadline;
  return line.charAt(0).toLocaleUpperCase("tr-TR") + line.slice(1);
}

/** The one big sentence on Bugün. */
export function todayHeadline(count: number, stopped: boolean): string {
  if (stopped) return "Her şey durduruldu — yeni öneri gelmez.";
  if (count === 0) return "Bugün öneri yok — tayfa izliyor.";
  return `Bugün ${fmtInt(count)} öneri var.`;
}

/** "199" → "199’unu", "13" → "13’ünü" (the thing owned, as an object). */
function possessiveAccusative(printed: string): string {
  const p = possessive(printed);
  return `${p}n${p.charAt(p.length - 1)}`;
}

/** "a, b ve c" */
function listTr(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} ve ${parts[parts.length - 1]}`;
}

/**
 * What the crew did today, in one sentence, from the day's counters: "Tayfa bugün 212 bildirim
 * okudu; 199’unu kurallar hemen eledi, 13’ünü inceledi ve 5 öneri çıkardı: 3’ü seni bekliyor,
 * 1’i imzalandı, 1’i reddedildi." Clauses with a zero are left out.
 */
export function crewDayLine(c: Pick<DayCounters, "total" | "processed" | "proposals" | "approvals" | "rejections"> | null): string | null {
  if (!c) return null;
  if (c.total === 0) return "Tayfa bugün henüz bildirim okumadı.";
  const screened = Math.max(0, c.total - c.processed);
  const waiting = Math.max(0, c.proposals - c.approvals - c.rejections);
  const work = [
    screened > 0 ? `${possessiveAccusative(fmtInt(screened))} kurallar hemen eledi` : null,
    c.processed > 0 ? `${possessiveAccusative(fmtInt(c.processed))} inceledi` : null,
    c.proposals > 0 ? `${fmtInt(c.proposals)} öneri çıkardı` : null,
  ].filter((x): x is string => x !== null);
  const outcome = [
    waiting > 0 ? `${possessive(fmtInt(waiting))} seni bekliyor` : null,
    c.approvals > 0 ? `${possessive(fmtInt(c.approvals))} imzalandı` : null,
    c.rejections > 0 ? `${possessive(fmtInt(c.rejections))} reddedildi` : null,
  ].filter((x): x is string => x !== null);
  const head = `Tayfa bugün ${fmtInt(c.total)} bildirim okudu`;
  const body = work.length ? `${head}; ${listTr(work)}` : head;
  return c.proposals > 0 && outcome.length ? `${body}: ${outcome.join(", ")}.` : `${body}.`;
}

/* ── the eight crew members, one line each ─────────────────────────────── */
export interface CrewLine {
  agent: "classifier" | "reader" | "materiality" | "evidence" | "skeptic" | "compliance" | "rule_engine" | "risk_gate";
  text: string;
  /** This member changed the amount (Şüpheci shrank it, Risk Kapısı capped it). */
  changed: boolean;
}

const SHRINK: Readonly<Record<number, string>> = {
  1: "Tutara dokunmadı.",
  0.75: "Tutarı dörtte bir azalttı.",
  0.5: "Tutarı yarıya indirdi.",
  0.25: "Tutarı dörtte bire indirdi.",
};

/** The same shrink, as the verb in the lead ("Şüpheci dörtte bir azalttı"). */
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

/** "Kârın bir kısmı …" → "kârın bir kısmı ….": a clause after a colon, ending in a full stop. */
function asClause(text: string): string {
  const t = text.trim();
  const lowered = t.charAt(0).toLocaleLowerCase("tr-TR") + t.slice(1);
  return /[.!?]$/.test(lowered) ? lowered : `${lowered}.`;
}

/** Uyum's line: when it flagged something, the exact point it wants a person to look at. */
function complianceLine(card: ApprovalCard, e: Explain | null): string {
  const flagged = e?.compliance?.decision === "escalate" || card.compliance_summary_tr.includes("inceleme");
  if (!flagged) return "Tedbir yok, metinde gizli talimat yok.";
  const point = e?.compliance?.checks.find((c) => c.result === "escalate")?.detail_tr;
  return point ? `Tedbir yok. Senin bakmanı istediği nokta: ${asClause(point)}` : "Tedbir yok; bir noktayı insan incelemesi için işaretledi.";
}

export function crewLines(card: ApprovalCard, e: Explain | null): CrewLine[] {
  const conf = e?.classifier ? ` (%${Math.round(e.classifier.confidence * 100)} emin)` : "";
  const amount = e?.merged?.amount_try ?? null;
  const rule = mainRule(card);
  const tally = ruleTally(card.rule_trace_summary);
  const risk = e?.risk_checks ?? [];
  const riskPassed = risk.filter((r) => r.outcome !== "reject").length;
  const shrunk = card.final_notional_try < card.requested_notional_try;
  const condition = CONDITION[card.event_type] ?? "olay";
  return [
    { agent: "classifier", changed: false, text: `Bunu “${card.sub_type_tr.toLocaleLowerCase("tr-TR")}” olarak tanıdı${conf}.` },
    {
      agent: "reader",
      changed: false,
      text: amount ? `Metindeki tutarı okudu: ${fmtTry(amount)}. Rakamı metinle karşılaştırdı, tuttu.` : "Metindeki rakamları ve tarafları çıkardı.",
    },
    { agent: "materiality", changed: false, text: materialityLine(card.event_type, rule?.observed ?? null) },
    { agent: "evidence", changed: false, text: `Geçmişte ${fmtInt(card.evidence_summary.n)} benzer olay buldu, sonuçlarına bakmadan seçti.` },
    { agent: "skeptic", changed: card.size_multiplier < 1, text: `${firstSentence(card.skeptic_note_tr)}. ${SHRINK[card.size_multiplier] ?? ""}`.trim() },
    { agent: "compliance", changed: false, text: complianceLine(card, e) },
    { agent: "rule_engine", changed: false, text: `${tally.passed}/${tally.total} kural geçti; ${condition} şartı sağlandı.` },
    {
      agent: "risk_gate",
      changed: shrunk,
      text: `${risk.length ? `${riskPassed}/${risk.length} risk kontrolü geçti. ` : ""}${shrunk ? `Tutarı ${fmtTry(card.final_notional_try)} ile sınırladı.` : `Tutar: ${fmtTry(card.final_notional_try)}.`}`,
    },
  ];
}

/**
 * The crew's work in one sentence, above the eight lines: "8 üye çalıştı; 2’si tutarı
 * değiştirdi: Şüpheci dörtte bir azalttı, Risk Kapısı 43.495 TL ile sınırladı."
 */
export function crewLead(lines: readonly CrewLine[], card: Pick<ApprovalCard, "size_multiplier" | "final_notional_try">): string {
  const changed = lines.filter((l) => l.changed);
  const head = `${fmtInt(lines.length)} üye çalıştı`;
  if (!changed.length) return `${head}; hiçbiri tutarı değiştirmedi.`;
  const what = changed.map((l) => {
    const name = crewByAgent(l.agent).name;
    if (l.agent === "skeptic") return `${name} ${SHRINK_VERB[card.size_multiplier] ?? "tutarı küçülttü"}`;
    if (l.agent === "risk_gate") return `${name} ${fmtTry(card.final_notional_try)} ile sınırladı`;
    return `${name} değiştirdi`;
  });
  return `${head}; ${possessive(fmtInt(changed.length))} tutarı değiştirdi: ${what.join(", ")}.`;
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

/**
 * The risk in plain words: "Fiyat 70,06 TL’ye düşerse satman gerekir; o noktada kaybın en fazla
 * ≈ 4.262 TL olur. Bu, işlem başına sınırın (sermayenin %0,5’i ≈ 5.093 TL) altında." The second
 * sentence needs the per-trade limit and the portfolio's size; without them it is left out.
 */
export function riskSentence(risk: RiskView, limit: { pct: number; equity: number } | null): string {
  const first = `Fiyat ${fmtPrice(risk.stopPrice)}’ye düşerse satman gerekir; o noktada kaybın en fazla ≈ ${fmtTry(risk.maxLoss)} olur.`;
  if (!limit || limit.pct <= 0 || limit.equity <= 0) return first;
  const cap = limit.equity * limit.pct;
  const side = risk.maxLoss <= cap ? "altında" : "üstünde";
  return `${first} Bu, işlem başına sınırın (sermayenin ${possessive(fmtPct(limit.pct, 1))} ≈ ${fmtTry(cap)}) ${side}.`;
}

/**
 * The disclosure's most telling sentence, for the quote under "Ne oldu?": the first sentence
 * after the title that carries a figure (a digit, % or TL); else the first sentence of the
 * second paragraph; null when the text has neither.
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

/** The company's name without the legal suffix ("ÖRNEK ENERJİ A.Ş." → "ÖRNEK ENERJİ"). */
export function shortName(name: string): string {
  return name.replace(/\s+(A\.Ş\.|T\.A\.Ş\.|SANAYİ VE TİCARET A\.Ş\.)$/u, "").trim();
}
