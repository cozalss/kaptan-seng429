import { z } from "zod";
import { IsoDate, IsoDateTime, Ticker } from "./common";

/**
 * Company actions on the shares the person holds (backend `portfolio/corporate.py`, wave 4):
 *  - GET  /me/corporate                       → CorporateBook
 *  - POST /me/corporate/dividends             → CorporateBook   (DividendInput)
 *  - POST /me/corporate/bonus                 → CorporateBook   (BonusInput: a bonus issue or a split)
 *  - POST /me/corporate/rights                → CorporateBook   (RightsInput)
 *  - POST /me/corporate/{id}/undo             → CorporateBook   (a correction row; nothing is deleted)
 *  - GET  /me/corporate/notices               → NoticeAnswer    (KAP notices about shares held now)
 *  - POST /me/corporate/notices/{id}/dismiss  → NoticeAnswer
 * A dividend is income (cash and "since the start" rise by it, never a deposit). A bonus issue keeps the
 * total cost; a rights issue pays cash. Money is TL as plain numbers.
 */
export const MAX_CORPORATE_TRY = 1e10;
export const MAX_BONUS_PCT = 10_000;

export const CorporateKind = z.enum(["dividend", "bonus", "rights"]);
export type CorporateKind = z.infer<typeof CorporateKind>;

export const NoticeKind = z.enum(["dividend", "bonus", "rights", "split"]);
export type NoticeKind = z.infer<typeof NoticeKind>;

/** Cash the bank paid in: `net_try` is what arrived, after withholding, as the bank shows it. */
export const DividendInput = z.object({
  ticker: Ticker,
  net_try: z.number().positive().max(MAX_CORPORATE_TRY),
  gross_try: z.number().positive().max(MAX_CORPORATE_TRY).nullish(),
  /** Not in the future. */
  received_on: IsoDate,
  note: z.string().trim().max(200).default(""),
  notice_id: z.string().max(60).nullish(),
});
export type DividendInput = z.input<typeof DividendInput>;

/** The new total share count OR the bonus percentage (100 = one new share per share), never both. */
export const BonusInput = z
  .object({
    ticker: Ticker,
    /** The day the shares start trading at the new price. Not in the future. */
    ex_date: IsoDate,
    new_qty: z.number().int().positive().nullish(),
    bonus_pct: z.number().positive().max(MAX_BONUS_PCT).nullish(),
    note: z.string().trim().max(200).default(""),
    notice_id: z.string().max(60).nullish(),
  })
  .refine((b) => (b.new_qty == null) !== (b.bonus_pct == null), { message: "Yeni adedi ya da yüzdeyi yaz; ikisini birden değil." });
export type BonusInput = z.input<typeof BonusInput>;

/** `qty` new shares bought at `price` each, paid from cash. */
export const RightsInput = z.object({
  ticker: Ticker,
  subscribed_on: IsoDate,
  qty: z.number().int().positive(),
  price: z.number().positive().max(MAX_CORPORATE_TRY),
  note: z.string().trim().max(200).default(""),
  notice_id: z.string().max(60).nullish(),
});
export type RightsInput = z.input<typeof RightsInput>;

/** One thing the person recorded. A correction names the record it undoes in `corrects`. */
export const CorporateRecord = z.object({
  id: z.string(),
  kind: CorporateKind,
  ticker: z.string(),
  company: z.string(),
  occurred_at: IsoDateTime,
  recorded_at: IsoDateTime,
  /** Dividend: cash received. Rights: cash paid. */
  net_try: z.number().nullable(),
  gross_try: z.number().nullable(),
  qty_added: z.number().int().nullable(),
  qty_after: z.number().int().nullable(),
  price: z.number().nullable(),
  note: z.string(),
  corrects: z.string().nullable(),
  undone: z.boolean(),
});
export type CorporateRecord = z.infer<typeof CorporateRecord>;

/** What one share paid the person: this calendar year (Istanbul) and in all. */
export const DividendTotal = z.object({
  ticker: z.string(),
  company: z.string(),
  this_year_try: z.number(),
  total_try: z.number(),
});
export type DividendTotal = z.infer<typeof DividendTotal>;

export const CorporateBook = z.object({
  this_year_try: z.number(),
  total_try: z.number(),
  per_holding: z.array(DividendTotal),
  /** Newest first. */
  records: z.array(CorporateRecord),
});
export type CorporateBook = z.infer<typeof CorporateBook>;

/** A KAP disclosure about an action on a share the person holds. A fact the code could not read is null. */
export const CorporateNotice = z.object({
  id: z.string(),
  ticker: z.string(),
  kind: NoticeKind,
  headline: z.string(),
  published_at: IsoDateTime,
  held_qty: z.number().int(),
  per_share_gross_try: z.number().nullable(),
  per_share_net_try: z.number().nullable(),
  pay_date: IsoDate.nullable(),
  ex_date: IsoDate.nullable(),
  bonus_pct: z.number().nullable(),
  expected_gross_try: z.number().nullable(),
  /** Says when the numbers could not be read from the notice ("" when they could). */
  facts_note: z.string(),
  url: z.string(),
});
export type CorporateNotice = z.infer<typeof CorporateNotice>;

export const NoticeAnswer = z.object({ notices: z.array(CorporateNotice) });
export type NoticeAnswer = z.infer<typeof NoticeAnswer>;
