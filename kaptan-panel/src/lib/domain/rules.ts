import { z } from "zod";
import { Confidence, EventType, IsoDateTime } from "./common";
import { EvidenceStrength } from "./agents";

/* ── Merge node (05 §5.0): deterministic, Decimal ratios, regex amount check ── */
const num = z.number().nullable();
const bool = z.boolean().nullable();

export const MergedFeatures = z.object({
  run_id: z.string(),
  disclosure_index: z.number().int().positive(),
  ticker: z.string(),
  as_of: IsoDateTime,
  event_type: EventType,
  sub_type: z.string(),
  agent_status: z.record(z.string(), z.enum(["ok", "abstain", "failed", "skipped"])),
  agent_confidence: z.record(z.string(), Confidence),
  any_injection_flag: z.boolean(),
  degraded: z.boolean(),
  // E1
  e1_nature: z.string().nullable(),
  new_buyback_rows: z.number().int().nullable(),
  buyback_10d_capital_pct: num,
  buyback_10d_notice_count: z.number().int().nullable(),
  buyback_sale_within_20d: bool,
  // E2
  insider_role_class: z.string().nullable(),
  insider_open_market: bool,
  insider_net_buy_value_try: num,
  insider_buy_to_ff_mcap: num,
  insider_cluster_30d: z.number().int().nullable(),
  ret_3m: num,
  // amount cross-check (R14)
  reader_amount: num,
  regex_amounts: z.array(z.number()),
  amount_in_text: bool,
  // E3
  binding: bool,
  related_party: bool,
  renewal: bool,
  amount_try: num,
  amount_to_revenue_annualized: num,
  amount_to_mcap: num,
  e3_denominator: z.enum(["annual_revenue", "market_cap"]).nullable(),
  // E4 (free-form, e4_* keys)
  e4: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
  // market
  last_price: num,
  price_at: IsoDateTime.nullable(),
  upper_limit: num,
  lower_limit: num,
  adv20_try: num,
  free_float_pct: num,
  leakage_5d_mkt_adj: num,
  ret_10d_mkt_adj: num,
  // evidence
  evidence_card_id: z.string().nullable(),
  evidence_strength: EvidenceStrength.nullable(),
  evidence_n: z.number().int().nullable(),
  evidence_median_car_5d: num,
  evidence_median_car_20d: num,
  evidence_ids: z.array(z.string()),
  retrieved_ids: z.array(z.string()),
  flags: z.array(z.string()),
});
export type MergedFeatures = z.infer<typeof MergedFeatures>;

/* ── Rule engine (06, 05 RuleDecision; trace format 04 §6.1) ──────────── */
export const RuleTraceEntry = z.object({
  rule: z.string().regex(/^(E[1-4]|LEAK|EDGE|EVIDENCE|AVOID|HOLD)\.[a-z0-9_]+$/),
  passed: z.boolean(),
  observed: z.string().nullable(),
  threshold: z.string().nullable(),
  detail_tr: z.string(),
});
export type RuleTraceEntry = z.infer<typeof RuleTraceEntry>;

/** Reason codes in consumption order (05). */
export const REASON_CODE_ORDER = [
  "HOLD_AGENT_FAILED",
  "HOLD_AGENT_ABSTAIN",
  "HOLD_LOW_CONFIDENCE",
  "HOLD_UNSUPPORTED_VETO",
  "SKEPTIC_VETO",
  "AVOID_LIST",
  "NO_EVIDENCE",
  "INJECTION_REVIEW",
  "E_RULE_NOT_MET",
  "LEAKAGE_HALF",
  "LEAKAGE_SKIP",
  "E_RULE_MET",
] as const;

export const RuleOutcome = z.enum(["PROPOSE", "NO_TRADE", "HOLD"]);
export type RuleOutcome = z.infer<typeof RuleOutcome>;

export const RuleDecision = z.object({
  outcome: RuleOutcome,
  reason_codes: z.array(z.string()),
  rules_fired: z.array(z.string()),
  rules_hash: z.string(),
  trace: z.array(RuleTraceEntry),
});
export type RuleDecision = z.infer<typeof RuleDecision>;

/* ── Risk gate R01–R16 (06 §10) ───────────────────────────────────────── */
export const RiskRuleCode = z.enum([
  "R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08",
  "R09", "R10", "R11", "R12", "R13", "R14", "R15", "R16",
]);
export type RiskRuleCode = z.infer<typeof RiskRuleCode>;

/** Execution order of the pre-trade gate; R16 runs at send time. */
export const RISK_GATE_ORDER: readonly RiskRuleCode[] = [
  "R01", "R02", "R03", "R04", "R13", "R11", "R14", "R05",
  "R06", "R09", "R12", "R07", "R08", "R10", "R15",
];

export const RISK_RULES: Readonly<Record<RiskRuleCode, { label_tr: string; summary_tr: string }>> = {
  R01: { label_tr: "Kill switch", summary_tr: "Kill switch açık mı; zirveden düşüş ≤ −%5 mi" },
  R02: { label_tr: "Günlük zarar", summary_tr: "Günlük K/Z ≤ −%1 ise yeni emir durur" },
  R03: { label_tr: "Evren", summary_tr: "Hisse likidite ve halka açıklık alt sınırıyla evrende mi" },
  R04: { label_tr: "Tedbir", summary_tr: "SPK/VBTS tedbiri sert veto; 24 saatten eski tedbir verisi HOLD" },
  R05: { label_tr: "Kanıt", summary_tr: "Kanıt kimlikleri getirilenlerin alt kümesi, karar anından önce, n ≥ 5" },
  R06: { label_tr: "Avantaj / maliyet", summary_tr: "Beklenen avantaj ≥ 2 × tahmini maliyet" },
  R07: { label_tr: "Büyüklük", summary_tr: "%0,5 risk / stop; pozisyon ≤ %10; hacmin ≤ %1'i; nakit" },
  R08: { label_tr: "Portföy limitleri", summary_tr: "Mükerrer, en çok 10 pozisyon, günlük giriş, sektör %25, grup %20" },
  R09: { label_tr: "Fiyat bandı", summary_tr: "Son fiyat ±%2, tavana %1 yakınlık, 20 dakikadan eski fiyat" },
  R10: { label_tr: "Kriz rejimi", summary_tr: "Krizde maruziyet ×0,5; E3 reddedilir" },
  R11: { label_tr: "Kota ve veri", summary_tr: "LLM kotası, KAP gecikmesi (300 sn), şema, injection" },
  R12: { label_tr: "Yalnızca alım", summary_tr: "Açığa satış yok, kaldıraç yok, kişisel mod silahlanmamış" },
  R13: { label_tr: "Ekip engel listesi", summary_tr: "Ekip içeriden-öğrenen engel listesinde değil" },
  R14: { label_tr: "Tutar uyuşması", summary_tr: "Okuyucu tutarı metindeki regex tutarlarıyla eşleşiyor (±%0,5)" },
  R15: { label_tr: "Onay zorunlu", summary_tr: "Her öneri insan onayına gider; ertesi seans 09:50'de düşer" },
  R16: { label_tr: "Gönderim anı", summary_tr: "Onay süresi; R01–R04, R09, R12, R13 yeniden; fiş 30 dk" },
};

export const RiskOutcome = z.enum(["pass", "resize", "reject", "hold", "approval_required"]);
export type RiskOutcome = z.infer<typeof RiskOutcome>;

export const RiskCheck = z.object({
  phase: z.enum(["pre_trade", "at_send"]),
  rule_code: RiskRuleCode,
  outcome: RiskOutcome,
  reason_code: z.string().nullable(),
  detail_tr: z.string(),
  observed: z.string().nullable(),
  limit: z.string().nullable(),
});
export type RiskCheck = z.infer<typeof RiskCheck>;
