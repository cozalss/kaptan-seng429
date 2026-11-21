import { z } from "zod";
import { IsoDate, IsoDateTime } from "./common";
import { DisclosureListItem } from "./disclosure";
import { ApprovalCard, Order, PnlPoint, Position } from "./trading";

/* ── Morning brief, 08:45 (_KANONIK, 04 §12, US-42) ───────────────────── */
export const MorningBrief = z.object({
  date: IsoDate,
  generated_at: IsoDateTime,
  important_disclosures: z.array(DisclosureListItem),
  /** Approved OPG orders queued for today's 09:40 opening auction (current status attached). */
  orders_for_open: z.array(Order),
  pending_approvals: z.array(ApprovalCard),
  open_positions: z.array(Position),
  expiring_today: z.array(Position),
  risk_warnings: z.array(z.object({ level: z.enum(["info", "warn", "critical"]), text_tr: z.string() })),
  restriction_changes: z.array(
    z.object({ ticker: z.string(), kind: z.string(), change: z.enum(["added", "removed"]), at: IsoDateTime }),
  ),
  /** LLM-generated, unverified ("LLM üretimi, doğrulanmamış"). */
  summary_tr: z.string(),
  is_sample: z.boolean(),
});
export type MorningBrief = z.infer<typeof MorningBrief>;

/* ── Evaluation, 4 layers (08) ────────────────────────────────────────── */
export const EvalClass = z.enum(["E1", "E2", "E3", "E4", "X", "O"]);
export type EvalClass = z.infer<typeof EvalClass>;

export const ClassificationEval = z.object({
  split: z.literal("gold_test_200"),
  macro_f1: z.number(),
  target_macro_f1: z.literal(0.85),
  per_class: z.array(
    z.object({ cls: EvalClass, f1: z.number(), precision: z.number(), recall: z.number(), support: z.number().int() }),
  ),
  /** rows = gold, cols = predicted, in EvalClass order. */
  confusion: z.array(z.array(z.number().int().nonnegative())),
  kappa: z.number(),
  ece: z.number(),
  models: z.array(z.object({ model_id: z.string(), macro_f1: z.number(), e3_f1: z.number(), x_recall: z.number() })),
});
export type ClassificationEval = z.infer<typeof ClassificationEval>;

export const RagEval = z.object({
  questions: z.literal(50),
  faithfulness: z.number(),
  context_precision: z.number(),
  context_recall: z.number(),
  recall_at_10: z.number(),
  mrr: z.number(),
  time_violations: z.number().int().nonnegative(),
  stores: z.array(z.object({ store: z.enum(["pgvector", "chroma"]), faithfulness: z.number(), recall_at_10: z.number() })),
  trend: z.array(z.object({ d: IsoDate, faithfulness: z.number(), context_precision: z.number(), context_recall: z.number() })),
});
export type RagEval = z.infer<typeof RagEval>;

export const HoldoutRow = z.object({
  event_type: z.enum(["E1", "E2", "E3", "E4", "ALL"]),
  n: z.number().int().nonnegative(),
  car_1: z.number(),
  car_5: z.number(),
  car_20: z.number(),
  car_60: z.number().nullable(),
  t_stat: z.number(),
  sharpe: z.number(),
  sortino: z.number(),
  max_dd: z.number(),
  cost_scenario: z.enum(["base_005", "stress_020"]),
});
export type HoldoutRow = z.infer<typeof HoldoutRow>;

export const AblationRow = z.object({
  arm: z.string().regex(/^(B[0-3]|A[0-7])$/),
  label_tr: z.string(),
  sharpe: z.number(),
  max_dd: z.number(),
  total_return: z.number(),
  n_trades: z.number().int().nonnegative(),
});
export type AblationRow = z.infer<typeof AblationRow>;

export const EvalSummary = z.object({
  is_sample: z.boolean(),
  label: z.string(),
  as_of: IsoDateTime,
  l1: ClassificationEval,
  l2: RagEval,
  l3: z.object({ window: z.literal("2025-01-01 → 2026-10-31"), run_once: z.literal(true), rows: z.array(HoldoutRow) }),
  l4: z.object({ series: z.array(PnlPoint), since: z.object({ v1_0: IsoDate, v1_1: IsoDate }), closed_trades: z.number().int() }),
  ablations: z.array(AblationRow),
  redteam: z.object({
    malicious: z.number().int(),
    benign: z.number().int(),
    orders_from_malicious: z.number().int().nonnegative(),
    block_rate: z.number(),
    false_alarm_rate: z.number(),
    by_code: z.object({ Q: z.number().int(), N: z.number().int(), H: z.number().int(), F: z.number().int() }),
  }),
  latency: z.object({ p50_s: z.number(), p95_s: z.number(), target_p95_s: z.literal(60) }),
  cost: z.object({ calls_today: z.number().int(), tokens_today: z.number().int(), tokens_per_decision: z.number().int() }),
  shadow: z.array(
    z.object({ proposal_id: z.string(), ticker: z.string(), rejected_by: z.string(), shadow_return_20d: z.number() }),
  ),
});
export type EvalSummary = z.infer<typeof EvalSummary>;

/* ── Karne: the track record, the money line against BIST 100, the monthly/yearly report ── */
export const TrackDecision = z.enum(["took", "approved_open", "not_bought", "declined", "skipped", "expired", "waiting", "cancelled"]);
export type TrackDecision = z.infer<typeof TrackDecision>;

/** One suggestion and what happened after it. Ratios: 0.032 = +%3,2; null while the period is open or has no prices. */
export const TrackItem = z.object({
  proposal_id: z.string(),
  ticker: z.string(),
  company_name: z.string(),
  suggested_at: IsoDateTime,
  decision: TrackDecision,
  decision_tr: z.string(),
  entry_day: IsoDate,
  /** Last day of the planned period: the result is known after its close. */
  result_day: IsoDate.nullable(),
  planned_sessions: z.number().int(),
  status: z.enum(["done", "open", "no_data"]),
  return_ratio: z.number().nullable(),
  index_ratio: z.number().nullable(),
  result_tr: z.string(),
});
export type TrackItem = z.infer<typeof TrackItem>;

const TrackGroup = z.object({ n: z.number().int().nonnegative(), avg_ratio: z.number().nullable() });
const TrackPick = z.object({ ticker: z.string(), company_name: z.string(), ratio: z.number() });

export const TrackSummary = z.object({
  count: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
  no_data: z.number().int().nonnegative(),
  up: z.number().int().nonnegative(),
  down: z.number().int().nonnegative(),
  flat: z.number().int().nonnegative(),
  avg_ratio: z.number().nullable(),
  index_avg_ratio: z.number().nullable(),
  best: TrackPick.nullable(),
  worst: TrackPick.nullable(),
  followed_all: TrackGroup,
  you_took: TrackGroup,
  you_skipped: TrackGroup,
  headline_tr: z.string(),
  caveat_tr: z.string().nullable(),
  compare_tr: z.string().nullable(),
});
export type TrackSummary = z.infer<typeof TrackSummary>;

export const TrackRecord = z.object({ as_of: IsoDateTime, items: z.array(TrackItem), summary: TrackSummary });
export type TrackRecord = z.infer<typeof TrackRecord>;

/** Your result over a period against BIST 100 over the same days; `available` false = show nothing. */
export const Benchmark = z.object({
  start: IsoDate.nullable(),
  end: IsoDate.nullable(),
  available: z.boolean(),
  you_ratio: z.number().nullable(),
  index_ratio: z.number().nullable(),
  sentence_tr: z.string().nullable(),
  reason_tr: z.string().nullable(),
});
export type Benchmark = z.infer<typeof Benchmark>;

export const KarnePeriod = z.enum(["month", "year"]);
export type KarnePeriod = z.infer<typeof KarnePeriod>;

export const Karne = z.object({
  period: KarnePeriod,
  label_tr: z.string(),
  start: IsoDate,
  end: IsoDate,
  is_current: z.boolean(),
  started: z.boolean(),
  /** Money put in during the period (start + deposits − withdrawals + cost of holdings added). */
  put_in_net: z.number(),
  value_start: z.number().nullable(),
  value_end: z.number().nullable(),
  /** value_end − value_start − outside money; null when a value is unknown. */
  gain_try: z.number().nullable(),
  realized_try: z.number(),
  /** Shares still held over their cost, now (current period only). */
  unrealized_try: z.number().nullable(),
  commissions_try: z.number(),
  /** Null until the book has dividend rows: the page leaves the line out. */
  dividends_try: z.number().nullable(),
  suggestions: z.object({
    made: z.number().int().nonnegative(),
    took: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    declined: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
    waiting: z.number().int().nonnegative(),
  }),
  decisions: z.number().int().nonnegative(),
  track: TrackSummary,
  benchmark: Benchmark,
  notes_tr: z.array(z.string()),
});
export type Karne = z.infer<typeof Karne>;

/** Why a day has (no) suggestions, from the day's real counts. */
export const QuietDay = z.object({
  day: IsoDate,
  read: z.number().int().nonnegative(),
  relevant: z.number().int().nonnegative(),
  proposals: z.number().int().nonnegative(),
  sentence_tr: z.string(),
  reasons: z.array(z.object({ reason_tr: z.string(), n: z.number().int().nonnegative() })),
});
export type QuietDay = z.infer<typeof QuietDay>;
