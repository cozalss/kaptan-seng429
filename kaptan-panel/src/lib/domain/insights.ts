import { z } from "zod";
import { IsoDate, IsoDateTime, Ticker } from "./common";

/**
 * What the Param screen says about the person's own money (backend `insights/*`, wave 5 PARAM). All of it is
 * derived from the ledger, the stored closes and stored exchange rates; nothing is guessed, and a number that
 * cannot be known honestly is null (the screen leaves it out).
 *  - GET /me/insights/allocation      → Allocation          PUT /me/insights/concentration → Allocation
 *  - GET /me/insights/closed-trades   → ClosedTrades
 *  - GET /me/insights/stats           → ReturnStats
 *  - GET /me/insights/dividends       → DividendIncome
 *  - GET /me/insights/versus          → Versus
 *  - GET /me/notes                    → HoldingNotes        PUT/DELETE /me/notes/{ticker} → HoldingNotes
 */
export const MIN_CONCENTRATION_PCT = 5;
export const MAX_CONCENTRATION_PCT = 100;
export const DEFAULT_CONCENTRATION_PCT = 25;
export const NOTE_MIN = 3;
export const NOTE_MAX = 500;

export const AllocationHolding = z.object({
  ticker: z.string(),
  company: z.string(),
  sector: z.string().nullable(),
  value_try: z.number(),
  pct: z.number(),
});
export type AllocationHolding = z.infer<typeof AllocationHolding>;

export const AllocationSector = z.object({
  /** "Sektörü bilinmiyor" is a row of its own, never merged into a real sector. */
  sector: z.string(),
  value_try: z.number(),
  pct: z.number(),
  tickers: z.array(z.string()),
});
export type AllocationSector = z.infer<typeof AllocationSector>;

/** Share of the whole money (cash included) per holding and per sector, and the person's own limit. */
export const Allocation = z.object({
  started: z.boolean(),
  equity_try: z.number(),
  cash_try: z.number(),
  cash_pct: z.number(),
  holdings: z.array(AllocationHolding),
  sectors: z.array(AllocationSector),
  threshold_pct: z.number(),
  /** Set when the biggest holding is above the limit: "Paranın %41'i tek hissede (ORNEK). Sınırın %25." */
  warning_tr: z.string().nullable(),
});
export type Allocation = z.infer<typeof Allocation>;

export const ConcentrationInput = z.object({ threshold_pct: z.number().int().min(MIN_CONCENTRATION_PCT).max(MAX_CONCENTRATION_PCT) });
export type ConcentrationInput = z.infer<typeof ConcentrationInput>;

/** One sale, matched to what the shares cost (average cost, commissions in it). */
export const ClosedTrade = z.object({
  id: z.string(),
  ticker: z.string(),
  company: z.string(),
  sold_at: IsoDateTime,
  qty: z.number().int(),
  cost_try: z.number(),
  proceeds_try: z.number(),
  gain_try: z.number(),
  gain_pct: z.number().nullable(),
  /** Null when the shares were entered by hand: the day they were really bought is not known. */
  days_held: z.number().int().nullable(),
});
export type ClosedTrade = z.infer<typeof ClosedTrade>;

export const ClosedTrades = z.object({
  trades: z.array(ClosedTrade),
  wins: z.number().int(),
  losses: z.number().int(),
  win_rate_pct: z.number().nullable(),
  total_gain_try: z.number(),
  avg_days_held: z.number().nullable(),
  note_tr: z.string().nullable(),
});
export type ClosedTrades = z.infer<typeof ClosedTrades>;

export const DayMove = z.object({ d: IsoDate, pct: z.number() });
export type DayMove = z.infer<typeof DayMove>;

/** Flow-free: a deposit or a withdrawal never counts as a gain or a loss. */
export const ReturnStats = z.object({
  available: z.boolean(),
  reason_tr: z.string().nullable(),
  days: z.number().int(),
  from: IsoDate.nullable(),
  to: IsoDate.nullable(),
  twr_pct: z.number().nullable(),
  best_day: DayMove.nullable(),
  worst_day: DayMove.nullable(),
  max_fall_pct: z.number().nullable(),
  fall_from: IsoDate.nullable(),
  fall_to: IsoDate.nullable(),
  caveat_tr: z.string().nullable(),
});
export type ReturnStats = z.infer<typeof ReturnStats>;

export const DividendMonth = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), total_try: z.number() });
export const DividendHolding = z.object({
  ticker: z.string(),
  company: z.string(),
  last12_try: z.number(),
  cost_try: z.number().nullable(),
  yield_on_cost_pct: z.number().nullable(),
});
export type DividendMonth = z.infer<typeof DividendMonth>;
export type DividendHolding = z.infer<typeof DividendHolding>;

/** Only dividends the person recorded; no forecast of dividends nobody has paid yet. */
export const DividendIncome = z.object({
  year: z.number().int(),
  this_year_try: z.number(),
  last_year_try: z.number(),
  total_try: z.number(),
  months: z.array(DividendMonth),
  holdings: z.array(DividendHolding),
});
export type DividendIncome = z.infer<typeof DividendIncome>;

export const VersusKey = z.enum(["you", "usd", "inflation", "deposit"]);
export const VersusItem = z.object({
  key: VersusKey,
  label: z.string(),
  pct: z.number().nullable(),
  source_tr: z.string().nullable(),
  /** Why it is not shown (no reliable official series for these days). */
  hidden_reason_tr: z.string().nullable(),
});
export type VersusItem = z.infer<typeof VersusItem>;

export const Versus = z.object({
  available: z.boolean(),
  from: IsoDate.nullable(),
  to: IsoDate.nullable(),
  items: z.array(VersusItem),
  reason_tr: z.string().nullable(),
});
export type Versus = z.infer<typeof Versus>;

export const HoldingNote = z.object({
  ticker: Ticker,
  company: z.string(),
  body: z.string(),
  updated_at: IsoDateTime,
});
export type HoldingNote = z.infer<typeof HoldingNote>;

export const HoldingNotes = z.object({ notes: z.array(HoldingNote) });
export type HoldingNotes = z.infer<typeof HoldingNotes>;

export const HoldingNoteInput = z.object({ body: z.string().trim().min(NOTE_MIN, "Notun en az 3 harf olsun.").max(NOTE_MAX, "Not en çok 500 harf olabilir.") });
export type HoldingNoteInput = z.infer<typeof HoldingNoteInput>;
