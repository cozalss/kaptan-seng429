import { z } from "zod";
import { IsoDate, IsoDateTime, Ticker } from "@/lib/domain/common";

/**
 * The person's own book (backend contract, wave 3 §C): the money they put in, the movements of
 * it, and the shares they already held before KAPtan. Money is TL as plain numbers.
 *  - GET  /me/money                → MoneyBook
 *  - POST /me/money                → MoneyBook           (MoneyInput)
 *  - POST /me/holdings             → Position            (HoldingInput)
 *  - POST /me/holdings/{id}/sell   → Position | null     (HoldingSellInput)
 *  - POST /me/money/{id}/correct   → MoneyBook           (MovementCorrectInput: the amount was typed wrong)
 *  - POST /me/money/{id}/undo      → MoneyBook           ("Bunu yanlış girdim")
 *  - GET/PUT /me/fee               → BrokerFee           (my broker's commission rate)
 *  - POST /me/book/reset           → BookResetOut        ("Baştan başla")
 *  - GET /me/books                 → PreviousBook[]      (the closed books, read-only)
 *  - GET /me/export.csv            → a file              ("Kayıtlarımı indir")
 */
export const MAX_MONEY_TRY = 1e10;

/** `holding` = a share entered by hand joined the book at its cost; it never comes in through POST /me/money. */
export const MoneyMovementKind = z.enum(["start", "deposit", "withdrawal", "holding"]);
export type MoneyMovementKind = z.infer<typeof MoneyMovementKind>;

/** `corrected`: the amount was fixed ("düzeltildi"); `undone`: taken back ("geri alındı"). Both stay in the list. */
export const MovementStatus = z.enum(["active", "corrected", "undone"]);
export type MovementStatus = z.infer<typeof MovementStatus>;

export const MoneyMovement = z.object({
  id: z.string(),
  kind: MoneyMovementKind,
  /** The amount in force now (a holding: what it cost). */
  amount_try: z.number().positive(),
  occurred_at: IsoDateTime,
  note: z.string(),
  status: MovementStatus.default("active"),
  /** The amount first typed, when it was corrected; null otherwise. */
  original_amount_try: z.number().nullable().default(null),
  /** When it was corrected or undone. */
  changed_at: IsoDateTime.nullable().default(null),
});
export type MoneyMovement = z.infer<typeof MoneyMovement>;

export const MoneyBook = z.object({
  /** Free cash now. */
  cash: z.number(),
  /** Money put in so far (the home's `capital_start`). */
  put_in: z.number(),
  /** Newest first. */
  movements: z.array(MoneyMovement),
});
export type MoneyBook = z.infer<typeof MoneyBook>;

export const MoneyInput = z.object({
  kind: z.enum(["start", "deposit", "withdrawal"]),
  amount_try: z.number().positive().max(MAX_MONEY_TRY),
  note: z.string().trim().max(200).optional(),
});
export type MoneyInput = z.infer<typeof MoneyInput>;

/** A share the person already owned before KAPtan: joins the book at cost, does not touch cash. */
export const HoldingInput = z.object({
  ticker: Ticker,
  qty: z.number().int().positive(),
  avg_cost: z.number().positive(),
  /** Not in the future (the server checks against its own clock). */
  bought_on: IsoDate,
});
export type HoldingInput = z.infer<typeof HoldingInput>;

/** Selling a hand-entered holding (a suggested position is sold through its ticket). */
export const HoldingSellInput = z.object({
  qty: z.number().int().positive(),
  price: z.number().positive(),
  /** Not in the future. */
  sold_at: IsoDateTime,
  /** What the bank charged in total; left out, the backend estimates it. */
  commission_try: z.number().nonnegative().optional(),
});
export type HoldingSellInput = z.infer<typeof HoldingSellInput>;

/**
 * Fix a movement: money rows take `amount_try`; a hand-entered holding takes `qty` and `avg_cost`
 * (and a new `bought_on`). A correction is never a gain or a loss.
 */
export const MovementCorrectInput = z.object({
  amount_try: z.number().positive().max(MAX_MONEY_TRY).optional(),
  qty: z.number().int().positive().optional(),
  avg_cost: z.number().positive().optional(),
  bought_on: IsoDate.optional(),
  note: z.string().trim().max(200).optional(),
});
export type MovementCorrectInput = z.infer<typeof MovementCorrectInput>;

/** Fractions: 0.002 is binde 2. BSMV (the bank's tax on the commission) comes on top. */
export const MAX_COMMISSION_RATE = 0.01;

export const BrokerFee = z.object({
  /** The rate in force now. */
  commission_rate: z.number().nonnegative(),
  /** KAPtan's built-in rate, used until you enter yours. */
  default_rate: z.number().nonnegative(),
  bsmv: z.number().nonnegative(),
  /** True when the rate in force is yours. */
  own: z.boolean(),
});
export type BrokerFee = z.infer<typeof BrokerFee>;

/** `commission_rate` null: back to KAPtan's built-in rate. */
export const BrokerFeeInput = z.object({
  commission_rate: z.number().min(0).max(MAX_COMMISSION_RATE).nullable(),
});
export type BrokerFeeInput = z.infer<typeof BrokerFeeInput>;

/** The word that confirms starting over (any case). */
export const RESET_WORD = "baştan";

export const BookResetInput = z.object({ confirm: z.string().max(40) });
export type BookResetInput = z.infer<typeof BookResetInput>;

export const BookResetOut = z.object({
  closed_book: z.number().int().positive(),
});
export type BookResetOut = z.infer<typeof BookResetOut>;

/** A closed book as it stood when the person started over ("önceki defter"). */
export const PreviousBook = z.object({
  no: z.number().int().positive(),
  opened_at: IsoDateTime,
  closed_at: IsoDateTime,
  started_with: z.number(),
  put_in: z.number(),
  cash: z.number(),
  equity: z.number(),
  movements: z.array(MoneyMovement),
  positions: z.array(z.object({ ticker: z.string(), qty: z.number().int(), avg_cost: z.number() })),
});
export type PreviousBook = z.infer<typeof PreviousBook>;
