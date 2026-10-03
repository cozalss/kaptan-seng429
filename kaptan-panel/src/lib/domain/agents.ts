import { z } from "zod";
import {
  AbstainInfo,
  AgentStatus,
  Confidence,
  EventCode,
  EventType,
  IsoDate,
  IsoDateTime,
  SourceQuote,
} from "./common";

/* ── Plumbing nodes (05 §5.0) ─────────────────────────────────────────── */
export const RouteResult = z.object({
  route: z.string(),
  sub_type_hint: z.string().nullable(),
  table_version: z.string(),
});
export type RouteResult = z.infer<typeof RouteResult>;

export const PreGateResult = z.object({ passed: z.boolean(), reasons: z.array(z.string()) });
export type PreGateResult = z.infer<typeof PreGateResult>;

/** Prompt Guard ≥ 0.90 quarantines; 0.50–0.90 is soft (compliance at least escalate). */
export const GUARD_QUARANTINE = 0.9;
export const GUARD_SOFT = 0.5;
export const GuardResult = z.object({
  quarantined: z.boolean(),
  injection_score: Confidence,
  regex_hits: z.array(z.string()),
  chunks_scored: z.number().int().nonnegative(),
  masked_names_n: z.number().int().nonnegative(),
});
export type GuardResult = z.infer<typeof GuardResult>;

/* ── Classifier (05) — confidence threshold 0.80 ──────────────────────── */
export const CLASSIFIER_MIN_CONFIDENCE = 0.8;
export const ClassifierOutput = z.object({
  status: AgentStatus,
  event_type: EventType,
  sub_type: z.string(),
  direction: z.enum(["positive", "negative", "neutral", "unknown"]),
  is_correction_or_update: z.boolean(),
  refers_to_prior_disclosure_date: IsoDate.nullable(),
  injection_suspected: z.boolean(),
  confidence: Confidence,
  rationale_tr: z.string().max(400),
  quotes: z.array(SourceQuote).min(1).max(3),
  abstain: AbstainInfo.nullable(),
});
export type ClassifierOutput = z.infer<typeof ClassifierOutput>;

/* ── Reader (05) — threshold 0.75 ─────────────────────────────────────── */
export const READER_MIN_CONFIDENCE = 0.75;
const ReaderBase = z.object({
  status: AgentStatus,
  confidence: Confidence,
  injection_suspected: z.boolean(),
  quotes: z.array(SourceQuote).min(1).max(8),
  notes_tr: z.string(),
  abstain: AbstainInfo.nullable(),
});

export const BuybackTxn = z.object({
  trade_date: IsoDate,
  nominal_tl: z.number().nonnegative(),
  capital_pct: z.number().nonnegative().nullable(),
  price_tl: z.number().positive().nullable(),
  price_raw: z.string(),
  prior_nominal_in_program_tl: z.number().nonnegative().nullable(),
});
export const BuybackExtraction = ReaderBase.extend({
  kind: z.literal("E1"),
  nature: z.enum(["execution", "program_announcement", "sale_of_repurchased", "program_completed_or_ended", "other"]),
  in_programme: z.boolean(),
  board_decision_date: IsoDate.nullable(),
  programme_max_nominal_tl: z.number().nonnegative().nullable(),
  transactions: z.array(BuybackTxn),
  cumulative_nominal_tl: z.number().nonnegative().nullable(),
  cumulative_capital_pct: z.number().nonnegative().nullable(),
  venue: z.string().nullable(),
});

export const InsiderRole = z.enum([
  "board_member",
  "executive",
  "controlling_shareholder",
  "related_person_of_insider",
  "investment_fund",
  "other_5pct_holder",
  "unknown",
]);
export const InsiderTradeExtraction = ReaderBase.extend({
  kind: z.literal("E2"),
  filer_kind: z.enum(["person", "entity", "unknown"]),
  /** Masked before any LLM call (KVKK): "KİŞİ_1". */
  person_or_entity: z.string(),
  role: InsiderRole,
  legal_basis: z.string().nullable(),
  direction: z.enum(["buy", "sell", "mixed"]),
  trades: z.array(
    z.object({
      trade_date: IsoDate,
      qty: z.number().nonnegative(),
      price_tl: z.number().positive().nullable(),
      value_tl: z.number().nonnegative().nullable(),
    }),
  ),
  holding_before_pct: z.number().nullable(),
  holding_after_pct: z.number().nullable(),
  open_market: z.boolean().nullable(),
  non_market_reason: z.string().nullable(),
});

export const BindingStatus = z.enum([
  "signed_contract",
  "order_received",
  "tender_award_final",
  "tender_award_not_final",
  "lowest_or_best_bid_only",
  "framework_agreement",
  "mou_or_loi",
  "unknown",
]);
export const ContractExtraction = ReaderBase.extend({
  kind: z.literal("E3"),
  counterparty_role: z.enum(["customer", "supplier", "partner", "other", "unknown"]),
  counterparty_name: z.string().nullable(),
  counterparty_disclosed: z.boolean(),
  counterparty_domestic: z.boolean().nullable(),
  counterparty_public_sector: z.boolean().nullable(),
  subject_tr: z.string(),
  amount: z.number().nonnegative().nullable(),
  currency: z.string().nullable(),
  amount_raw: z.string().nullable(),
  amount_try_stated: z.number().nonnegative().nullable(),
  vat: z.enum(["included", "excluded", "unknown"]),
  amount_is_estimate: z.boolean(),
  duration_months: z.number().nonnegative().nullable(),
  start_date: IsoDate.nullable(),
  binding_status: BindingStatus,
  related_party: z.boolean().nullable(),
  is_renewal_or_extension: z.boolean(),
  stated_share_of_revenue_pct: z.number().nullable(),
  stated_effect: z.string().nullable(),
});

export const FinancialReportExtraction = ReaderBase.extend({
  kind: z.literal("E4"),
  period: z.string().regex(/^\d{4}-(Q[1-4]|H1|9M|FY)$/),
  report_kind: z.string(),
  consolidated: z.boolean(),
  tms29_applied: z.boolean(),
  audit_opinion: z.string().nullable(),
  going_concern_emphasis: z.boolean(),
  guidance_direction: z.enum(["up", "down", "flat", "none"]),
  guidance_statements_tr: z.array(z.string()),
  one_off_items: z.array(z.string()),
  management_tone: z.enum(["positive", "neutral", "negative", "mixed"]),
  risk_mentions_tr: z.array(z.string()),
});

export const ReaderOutput = z.discriminatedUnion("kind", [
  BuybackExtraction,
  InsiderTradeExtraction,
  ContractExtraction,
  FinancialReportExtraction,
]);
export type ReaderOutput = z.infer<typeof ReaderOutput>;

/* ── Materiality (05) — threshold 0.70; fetches numbers, never ratios ──── */
export const MATERIALITY_MIN_CONFIDENCE = 0.7;
export const ValueRef = z.object({ name: z.string(), value: z.number(), ref_id: z.string() });
export type ValueRef = z.infer<typeof ValueRef>;
export const MaterialityOutput = z.object({
  status: AgentStatus,
  event_type: EventCode,
  denominator_kind: z.enum(["annual_revenue", "market_cap", "paid_in_capital", "free_float_mcap", "none"]),
  denominator: ValueRef.nullable(),
  revenue_available_at_as_of: z.boolean(),
  market_cap: ValueRef.nullable(),
  fx_rates: z.array(ValueRef),
  trade_day_close: ValueRef.nullable(),
  secondary: z.array(ValueRef),
  e4_lines: z.array(ValueRef),
  financials_period_end: IsoDate.nullable(),
  financials_stale_days: z.number().int().nullable(),
  data_gaps: z.array(z.string()),
  confidence: Confidence,
  notes_tr: z.string(),
  abstain: AbstainInfo.nullable(),
});
export type MaterialityOutput = z.infer<typeof MaterialityOutput>;

/* ── Evidence (05): selects without seeing returns; code computes stats ── */
export const EvidenceStrength = z.enum(["strong", "moderate", "weak", "insufficient"]);
export type EvidenceStrength = z.infer<typeof EvidenceStrength>;

export const EvidenceSelection = z.object({
  status: AgentStatus,
  event_type: EventCode,
  search_queries: z.array(z.string()),
  candidates_considered: z.number().int().nonnegative(),
  selected: z.array(
    z.object({
      ref_id: z.string().regex(/^evt:/),
      relevance: z.enum(["high", "medium"]),
      why_similar_tr: z.string(),
    }),
  ),
  same_ticker_selected: z.number().int().nonnegative(),
  exclusion_reasons: z.array(z.string()),
  already_announced_before: z.boolean(),
  already_announced_ref: z.string().nullable(),
  proposed_strength: EvidenceStrength,
  summary_tr: z.string(),
  confidence: Confidence,
  abstain: AbstainInfo.nullable(),
});
export type EvidenceSelection = z.infer<typeof EvidenceSelection>;

export const EventStats = z.object({
  ref_id: z.string(),
  n: z.number().int().nonnegative(),
  n_same_ticker: z.number().int().nonnegative(),
  median_car_5d: z.number(),
  mean_car_5d: z.number(),
  hit_rate_5d: z.number().min(0).max(1),
  median_car_20d: z.number(),
  mean_car_20d: z.number(),
  hit_rate_20d: z.number().min(0).max(1),
  ci95_car_20d: z.tuple([z.number(), z.number()]),
  dispersion_iqr_20d: z.number().nonnegative(),
});
export type EventStats = z.infer<typeof EventStats>;

/** Strength is capped by n: ≥15 strong, 8–14 moderate, 5–7 weak, <5 insufficient (05). */
export function strengthForN(n: number): EvidenceStrength {
  if (n >= 15) return "strong";
  if (n >= 8) return "moderate";
  if (n >= 5) return "weak";
  return "insufficient";
}

export const EvidenceCard = z.object({
  selection: EvidenceSelection,
  stats: EventStats,
  strength: EvidenceStrength,
  retrieved_ids: z.array(z.string()),
  card_id: z.string(),
});
export type EvidenceCard = z.infer<typeof EvidenceCard>;

/** One past event on the card (returns come from event_returns, never from the LLM). */
export const EvidenceEvent = z.object({
  ref_id: z.string(),
  ticker: z.string(),
  company_name: z.string(),
  published_at: IsoDateTime,
  title: z.string(),
  car_1d: z.number(),
  car_5d: z.number(),
  car_20d: z.number(),
  car_60d: z.number().nullable(),
});
export type EvidenceEvent = z.infer<typeof EvidenceEvent>;

/* ── Skeptic (05) — threshold 0.6; an unsupported veto becomes HOLD ───── */
export const SKEPTIC_MIN_CONFIDENCE = 0.6;
export const FlagCode = z.enum([
  "DUPLICATE_OR_CORRECTION",
  "NOT_BINDING",
  "RELATED_PARTY",
  "RENEWAL_NOT_NEW",
  "TOKEN_BUYBACK",
  "NOT_OPEN_MARKET",
  "FUND_NOT_INSIDER",
  "DILUTION_OR_HYPE",
  "MANIPULATION_MARKERS",
  "AMOUNT_NOT_IN_TEXT",
  "STALE_OR_WEAK_FINANCIALS",
  "WEAK_EVIDENCE",
  "INJECTION_SUSPECT",
  "OTHER",
]);
export type FlagCode = z.infer<typeof FlagCode>;
export const SkepticFlag = z.object({
  code: FlagCode,
  severity: z.enum(["info", "reduce", "veto"]),
  detail_tr: z.string(),
  supporting_ref: z.string().nullable(),
});
export type SkepticFlag = z.infer<typeof SkepticFlag>;
export const SkepticOutput = z.object({
  status: AgentStatus,
  flags: z.array(SkepticFlag),
  size_multiplier: z.union([z.literal(1), z.literal(0.75), z.literal(0.5), z.literal(0.25)]),
  veto: z.boolean(),
  strongest_counterargument_tr: z.string(),
  confidence: Confidence,
  abstain: AbstainInfo.nullable(),
});
export type SkepticOutput = z.infer<typeof SkepticOutput>;

/* ── Compliance (05) ──────────────────────────────────────────────────── */
export const CheckCode = z.enum([
  "SPK_MEASURE",
  "VBTS_MEASURE",
  "WATCHLIST_MARKET",
  "TRADING_HALT",
  "INFO_PUBLIC",
  "MARKET_ABUSE_RISK",
  "RESTRICTED_LIST",
  "SIGNAL_SHARING",
  "PROMPT_INJECTION",
  "RATIONALE_INTEGRITY",
]);
export type CheckCode = z.infer<typeof CheckCode>;
export const REQUIRED_CHECKS: readonly CheckCode[] = [
  "SPK_MEASURE",
  "VBTS_MEASURE",
  "WATCHLIST_MARKET",
  "INFO_PUBLIC",
  "PROMPT_INJECTION",
  "RATIONALE_INTEGRITY",
];
export const ComplianceCheck = z.object({
  code: CheckCode,
  result: z.enum(["pass", "fail", "escalate", "unknown"]),
  basis_ref: z.string().nullable(),
  detail_tr: z.string(),
});
export type ComplianceCheck = z.infer<typeof ComplianceCheck>;
export const ComplianceReport = z
  .object({
    status: AgentStatus,
    decision: z.enum(["pass", "escalate", "veto"]),
    checks: z.array(ComplianceCheck).min(6).max(10),
    regulation_refs: z.array(z.string()),
    summary_tr: z.string(),
    confidence: Confidence,
    abstain: AbstainInfo.nullable(),
  })
  .refine((r) => REQUIRED_CHECKS.every((c) => r.checks.some((k) => k.code === c)), {
    message: "Zorunlu uyum kontrolleri eksik",
  });
export type ComplianceReport = z.infer<typeof ComplianceReport>;
