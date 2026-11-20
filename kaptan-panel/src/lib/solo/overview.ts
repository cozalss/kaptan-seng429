import { z } from "zod";

/**
 * GET /api/v1/me/overview — the single-user home in one call (backend contract): how much
 * money there is, where it sits, how it moved, and what KAPtan suggests now. Approving or
 * declining a suggestion goes through the existing approval endpoints (`decideApproval`).
 */
export const SuggestionAction = z.enum(["al", "tut", "sat"]);
export type SuggestionAction = z.infer<typeof SuggestionAction>;

export const EquityPoint = z.object({ date: z.string().min(10), equity: z.number() });
export type EquityPoint = z.infer<typeof EquityPoint>;

export const Allocation = z.object({
  symbol: z.string().min(1),
  name: z.string(),
  amount: z.number().nonnegative(),
  /** Share of the total (0–1). */
  weight: z.number().min(0),
  /** Gain since bought (ratio: 0.031 = +%3,1). */
  pnl_pct: z.number(),
  /** When the price behind `amount` was known (null for cash: it has no price). */
  price_as_of: z.string().nullable(),
});
export type Allocation = z.infer<typeof Allocation>;

export const Suggestion = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  action: SuggestionAction,
  reason_short: z.string(),
  /** 0–1. Shown as plain words (Güçlü / Orta / Zayıf). */
  confidence: z.number().min(0).max(1),
  expires_at: z.string().nullable(),
});
export type Suggestion = z.infer<typeof Suggestion>;

export const Overview = z.object({
  /** True until the person has entered their starting money: every money field is 0, the arrays are empty. */
  needs_setup: z.boolean(),
  /** Money put in so far: start + deposits − withdrawals + the cost of holdings entered by hand. */
  capital_start: z.number().nonnegative(),
  /** Cash + holdings at their last known price. */
  equity_now: z.number().nonnegative(),
  /** The real free cash of the book. */
  cash: z.number(),
  /** `equity_now − capital_start`: a deposit is never a gain. */
  pnl_abs: z.number(),
  /** `pnl_abs / capital_start` (0 while nothing is put in). */
  pnl_pct: z.number(),
  /** The oldest "known at" time among the prices used for the holdings; null with no holdings. */
  prices_as_of: z.string().nullable(),
  /** Daily close of the person's book since the start (empty before the first close). */
  equity_series: z.array(EquityPoint),
  allocations: z.array(Allocation),
  open_suggestions: z.array(Suggestion),
});
export type Overview = z.infer<typeof Overview>;

/** POST /me/suggestions/{id}/hold: "Tut" (keep as is) or "Geç" on a suggestion; audited, needs proposal.decide. */
export const HoldKind = z.enum(["held", "skipped"]);
export type HoldKind = z.infer<typeof HoldKind>;

export const HoldInput = z.object({ kind: HoldKind, note: z.string().trim().max(500, "En çok 500 karakter").optional() });
export type HoldInput = z.infer<typeof HoldInput>;

export const HoldResult = z.object({ id: z.string(), kind: HoldKind, at: z.string() });
export type HoldResult = z.infer<typeof HoldResult>;
