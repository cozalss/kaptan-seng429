import { z } from "zod";
import { IsoDate, IsoDateTime } from "./common";
import { DisclosureListItem } from "./disclosure";
import { ApprovalCard, Order, PnlPoint, Position } from "./trading";

/** Every number in a sample fixture carries this label (never presented as real). */
export const SAMPLE_LABEL = "örnek değer · gerçek sonuç değil";

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
