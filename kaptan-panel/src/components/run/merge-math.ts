import type { Explain } from "@/lib/domain";

/**
 * Re-derives the Birleştirme ratio from the records (05 §5.0): Okuyucu amount, optional
 * annualisation over the contract length, divided by the Önemlilik denominator. The graph
 * computes it with Decimal; the panel recomputes it to show the arithmetic is reproducible.
 */
export const R14_TOLERANCE = 0.005;
export const RATIO_TOLERANCE = 0.0005;

export interface MergeCalc {
  amount: number;
  months: number | null;
  annualFactor: number;
  denominator: number;
  denominatorKind: string;
  denominatorRef: string;
  reported: number | null;
  recomputed: number;
  matches: boolean;
}

export function mergeCalc(e: Explain): MergeCalc | null {
  const m = e.merged;
  const den = e.materiality?.denominator;
  if (!m || !den || !m.amount_try || den.value <= 0) return null;
  const months = e.reader?.kind === "E3" ? e.reader.duration_months : null;
  const annualFactor = months && months > 12 ? 12 / months : 1;
  const recomputed = (m.amount_try * annualFactor) / den.value;
  const reported = m.amount_to_revenue_annualized ?? m.amount_to_mcap ?? null;
  return {
    amount: m.amount_try,
    months,
    annualFactor,
    denominator: den.value,
    denominatorKind: e.materiality?.denominator_kind ?? den.name,
    denominatorRef: den.ref_id,
    reported,
    recomputed,
    matches: reported === null ? true : Math.abs(reported - recomputed) <= RATIO_TOLERANCE,
  };
}

/** R14: does the Okuyucu amount match one of the regex amounts found in the text (±0,5%)? */
export function regexMatch(readerAmount: number | null, regexAmounts: readonly number[]): { matched: number | null; ok: boolean } {
  if (readerAmount === null || readerAmount === 0) return { matched: null, ok: false };
  const hit = regexAmounts.find((r) => Math.abs(r - readerAmount) <= Math.abs(readerAmount) * R14_TOLERANCE) ?? null;
  return { matched: hit, ok: hit !== null };
}
