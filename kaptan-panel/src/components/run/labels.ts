import type {
  AgentName,
  CheckCode,
  FlagCode,
  NodeName,
  RiskOutcome,
  RunOutcome,
  RunStatus,
  TraceNode,
} from "@/lib/domain";

/**
 * Turkish labels and tones for the run screens (FRONTEND-SPEC §2.4, §6.4–6.10).
 * Tone has a job (§8.8): `north` only for veto / rejection / critical, `wash` for state.
 */
export type Tone = "ink" | "wash" | "north" | "muted" | "outline";

export const STATUS_LABEL: Readonly<Record<RunStatus, { tr: string; tone: Tone }>> = {
  running: { tr: "Çalışıyor", tone: "wash" },
  interrupted: { tr: "Onay bekliyor", tone: "wash" },
  completed: { tr: "Tamamlandı", tone: "outline" },
  failed: { tr: "Hata", tone: "north" },
  hold_quota: { tr: "Kota bitti · HOLD", tone: "muted" },
  skipped: { tr: "Atlandı", tone: "muted" },
};

export const OUTCOME_LABEL: Readonly<Record<RunOutcome, { tr: string; short: string; tone: Tone }>> = {
  PROPOSE: { tr: "İşlem önerisi", short: "Öneri", tone: "ink" },
  NO_TRADE: { tr: "İşlem yok", short: "İşlem yok", tone: "outline" },
  HOLD: { tr: "HOLD · güvenli varsayılan", short: "HOLD", tone: "muted" },
  QUARANTINED: { tr: "Karantina · kural motoruna ulaşmadı", short: "Karantina", tone: "north" },
  PREGATE_VETO: { tr: "Ön eleme sert veto", short: "Sert veto", tone: "north" },
};

/** Outcome key used by the list filter; `null` outcome (archived / running) gets its own bucket. */
export type OutcomeKey = RunOutcome | "NONE";
export const OUTCOME_ORDER: readonly OutcomeKey[] = ["PROPOSE", "NO_TRADE", "HOLD", "QUARANTINED", "PREGATE_VETO", "NONE"];
export const NONE_LABEL = { tr: "Arşiv / sürüyor", short: "Arşiv", tone: "muted" as Tone };

export function outcomeLabel(key: OutcomeKey): { tr: string; short: string; tone: Tone } {
  return key === "NONE" ? NONE_LABEL : OUTCOME_LABEL[key];
}

export const RISK_OUTCOME_LABEL: Readonly<Record<RiskOutcome, { tr: string; tone: Tone }>> = {
  pass: { tr: "Geçti", tone: "ink" },
  resize: { tr: "Küçült", tone: "wash" },
  reject: { tr: "Ret", tone: "north" },
  hold: { tr: "HOLD", tone: "muted" },
  approval_required: { tr: "Onay gerekli", tone: "wash" },
};

export const CHECK_LABEL: Readonly<Record<CheckCode, string>> = {
  SPK_MEASURE: "SPK tedbiri",
  VBTS_MEASURE: "VBTS tedbiri",
  WATCHLIST_MARKET: "Yakın İzleme Pazarı",
  TRADING_HALT: "İşlem durdurma",
  INFO_PUBLIC: "Bilgi kamuya açık",
  MARKET_ABUSE_RISK: "Piyasa bozucu eylem",
  RESTRICTED_LIST: "Ekip engel listesi",
  SIGNAL_SHARING: "Sinyal paylaşımı",
  PROMPT_INJECTION: "Gizli talimat (injection)",
  RATIONALE_INTEGRITY: "Gerekçe bütünlüğü",
};

export const FLAG_LABEL: Readonly<Record<FlagCode, string>> = {
  DUPLICATE_OR_CORRECTION: "Mükerrer / düzeltme",
  NOT_BINDING: "Bağlayıcı değil",
  RELATED_PARTY: "İlişkili taraf",
  RENEWAL_NOT_NEW: "Yenileme, yeni iş değil",
  TOKEN_BUYBACK: "Sembolik geri alım",
  NOT_OPEN_MARKET: "Borsa dışı işlem",
  FUND_NOT_INSIDER: "Fon, yönetici değil",
  DILUTION_OR_HYPE: "Sulandırma / abartı",
  MANIPULATION_MARKERS: "Manipülasyon işaretleri",
  AMOUNT_NOT_IN_TEXT: "Tutar metinde yok",
  STALE_OR_WEAK_FINANCIALS: "Bayat / zayıf finansallar",
  WEAK_EVIDENCE: "Zayıf kanıt",
  INJECTION_SUSPECT: "Injection şüphesi",
  OTHER: "Diğer",
};

export const DENOMINATOR_LABEL: Readonly<Record<string, string>> = {
  annual_revenue: "Yıllık gelir",
  market_cap: "Piyasa değeri",
  paid_in_capital: "Ödenmiş sermaye",
  free_float_mcap: "Halka açık piyasa değeri",
  none: "Payda yok",
};

export const BINDING_LABEL: Readonly<Record<string, string>> = {
  signed_contract: "İmzalı sözleşme",
  order_received: "Sipariş alındı",
  tender_award_final: "Kesinleşmiş ihale",
  tender_award_not_final: "Kesinleşmemiş ihale",
  lowest_or_best_bid_only: "Yalnızca en iyi teklif",
  framework_agreement: "Çerçeve anlaşma",
  mou_or_loi: "Niyet mektubu / mutabakat",
  unknown: "Bilinmiyor",
};

export const NODE_KIND_LABEL = { llm: "LLM", code: "kod", human: "insan" } as const;

/**
 * Model fallback chain per agent (05 §models.yaml, 04 §15 Revizyon 3): primary → fallbacks → HOLD.
 * Configuration, not run data — the trace's `model_id` shows which step answered.
 */
const GEMINI_FIRST = ["Gemini", "Groq", "Azure", "Ollama", "HOLD"] as const;
const GROQ_FIRST = ["Groq", "Gemini", "Azure", "Ollama", "HOLD"] as const;
export const MODEL_CHAIN: Readonly<Record<AgentName, readonly string[]>> = {
  classifier: GROQ_FIRST,
  reader: GEMINI_FIRST,
  materiality: GEMINI_FIRST,
  evidence: GEMINI_FIRST,
  skeptic: GROQ_FIRST,
  compliance: GEMINI_FIRST,
};
/** Full provider names for the chain legend. */
export const PROVIDER_LABEL: Readonly<Record<string, string>> = {
  Gemini: "Gemini Flash-Lite",
  Groq: "Groq gpt-oss-120b",
  Azure: "Azure for Students",
  Ollama: "Ollama Qwen (yerel)",
  HOLD: "zincir biterse HOLD",
};

const AGENTS = new Set<NodeName>(["classifier", "reader", "materiality", "evidence", "skeptic", "compliance"]);
export function isAgentNode(n: NodeName): n is AgentName & NodeName {
  return AGENTS.has(n);
}

/** Which step of the chain answered: matched by provider family in the model id. */
export function chainStep(agent: AgentName, modelId: string | null): number {
  if (!modelId) return -1;
  const id = modelId.toLowerCase();
  const family = id.includes("gemini") ? "Gemini" : id.includes("gpt-oss") || id.includes("groq") ? "Groq" : id.includes("azure") ? "Azure" : id.includes("ollama") || id.includes("qwen") ? "Ollama" : null;
  if (!family) return -1;
  return MODEL_CHAIN[agent].findIndex((s) => s.startsWith(family));
}

export const TRACE_STATUS_LABEL: Readonly<Record<TraceNode["status"], string>> = {
  done: "bitti",
  skipped: "atlandı",
  failed: "hata",
  waiting: "bekliyor",
  running: "çalışıyor",
};

/** "0,93" — confidences and scores in Turkish decimals. */
export function fmtScore(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/** Reason codes from the pre-gate look like "R04_RESTRICTED: …": split the code off. */
export function splitReason(reason: string): { code: string | null; text: string } {
  const m = /^([A-Z][A-Z0-9_]+):\s*(.*)$/.exec(reason);
  if (!m) return { code: null, text: reason };
  return { code: m[1] ?? null, text: m[2] ?? "" };
}

/** Risk rule code inside a reason ("R04_RESTRICTED" → "R04"). */
export function riskCodeOf(code: string | null): string | null {
  const m = code ? /^(R\d{2})/.exec(code) : null;
  return m?.[1] ?? null;
}

/** Payload strings sometimes carry "5.9"; Turkish decimals use a comma ("%5,9"). */
export function trDecimal(s: string): string {
  return s.replace(/(\d)\.(\d{1,2})(?!\d)/g, "$1,$2");
}
