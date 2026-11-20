import { z } from "zod";
import { IsoDate, IsoDateTime, Ticker } from "@/lib/domain/common";

/**
 * The person's own book (backend contract, wave 3 §C): the money they put in, the movements of
 * it, and the shares they already held before KAPtan. Money is TL as plain numbers.
 *  - GET  /me/money                → MoneyBook
 *  - POST /me/money                → MoneyBook           (MoneyInput)
 *  - POST /me/holdings             → Position            (HoldingInput)
 *  - POST /me/holdings/{id}/sell   → Position | null     (HoldingSellInput)
 */
export const MAX_MONEY_TRY = 1e10;

/** `holding` = a share entered by hand joined the book at its cost; it never comes in through POST /me/money. */
export const MoneyMovementKind = z.enum(["start", "deposit", "withdrawal", "holding"]);
export type MoneyMovementKind = z.infer<typeof MoneyMovementKind>;

export const MoneyMovement = z.object({
  id: z.string(),
  kind: MoneyMovementKind,
  amount_try: z.number().positive(),
  occurred_at: IsoDateTime,
  note: z.string(),
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
