import { moneyError, parseMoney } from "./money-input";
import type { HoldingInput, HoldingSellInput } from "./money";

/**
 * The two small forms of the person's own shares, as plain logic: what they typed in, what is
 * wrong with it in plain words (one line per field), and the request to send once it all reads.
 * Nothing is computed here beyond reading the figures; the book does the arithmetic.
 */

/** A share code as typed: Turkish letters folded to the ASCII a code is written in, at most six. */
export function tickerFromTyping(raw: string): string {
  return raw
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

/** Prices on the bank's screen run to four decimals; amounts of money to two. */
export const PRICE_DECIMALS = 4;

export interface HoldingDraft {
  ticker: string;
  qty: string;
  cost: string;
  /** YYYY-MM-DD, from the date field. */
  boughtOn: string;
}

export type HoldingErrors = Record<keyof HoldingDraft, string | null>;

export interface HoldingCheck {
  errors: HoldingErrors;
  input: HoldingInput | null;
}

const QTY_WORDS = "Kaç adet olduğunu tam sayı olarak yaz. Örneğin 1.250";

/** A whole number of shares; null with a reason when it is not one. */
function readQty(raw: string): { qty: number | null; error: string | null } {
  if (!raw.trim()) return { qty: null, error: "Kaç adet olduğunu yaz." };
  const qty = parseMoney(raw, 0);
  if (qty === null) return { qty: null, error: QTY_WORDS };
  if (qty < 1) return { qty: null, error: "Adet en az 1 olmalı." };
  return { qty, error: null };
}

export function checkHoldingDraft(d: HoldingDraft, today: string): HoldingCheck {
  const qty = readQty(d.qty);
  const cost = parseMoney(d.cost, PRICE_DECIMALS);
  const errors: HoldingErrors = {
    ticker: /^[A-Z0-9]{3,6}$/.test(d.ticker) ? null : "Hisse kodunu yaz; 3 ile 6 harf. Örneğin THYAO",
    qty: qty.error,
    cost: !d.cost.trim() ? "Tanesini kaç liradan aldığını yaz." : (moneyError(d.cost, { maxDecimals: PRICE_DECIMALS }) ?? (cost !== null && cost > 0 ? null : "Tanesini kaç liradan aldığını yaz.")),
    boughtOn: !/^\d{4}-\d{2}-\d{2}$/.test(d.boughtOn) ? "Aldığın günün tarihini seç." : d.boughtOn > today ? "Bu tarih daha gelmedi." : null,
  };
  const failed = Object.values(errors).some(Boolean);
  if (failed || qty.qty === null || cost === null) return { errors, input: null };
  return { errors, input: { ticker: d.ticker, qty: qty.qty, avg_cost: cost, bought_on: d.boughtOn } };
}

export interface SaleDraft {
  qty: string;
  price: string;
  /** What the bank charged; empty = the book estimates it. */
  commission: string;
}

export type SaleErrors = Record<keyof SaleDraft, string | null>;

export interface SaleCheck {
  errors: SaleErrors;
  input: Omit<HoldingSellInput, "sold_at"> | null;
}

/** The sale form: `held` is how many of this share the person has left. */
export function checkSaleDraft(d: SaleDraft, held: number): SaleCheck {
  const qty = readQty(d.qty);
  const price = parseMoney(d.price, PRICE_DECIMALS);
  const commissionRaw = d.commission.trim();
  const commission = commissionRaw ? parseMoney(commissionRaw) : undefined;
  const errors: SaleErrors = {
    qty: qty.error ?? (qty.qty !== null && qty.qty > held ? `Elinde ${held.toLocaleString("tr-TR")} adet var; fazlasını satamazsın.` : null),
    price: !d.price.trim() ? "Tanesini kaç liradan sattığını yaz." : (moneyError(d.price, { maxDecimals: PRICE_DECIMALS }) ?? (price !== null && price > 0 ? null : "Tanesini kaç liradan sattığını yaz.")),
    commission: commission === null ? "Komisyonu rakamla yaz ya da boş bırak." : null,
  };
  if (Object.values(errors).some(Boolean) || qty.qty === null || price === null || commission === null) return { errors, input: null };
  return { errors, input: { qty: qty.qty, price, commission_try: commission } };
}
