import type { CorporateKind } from "@/lib/domain/corporate";

/**
 * The test double's company actions as arithmetic: what a dividend, a bonus issue or a rights issue
 * did to the cash and to a hand-entered holding. Rows are append-only; an undo is a row that names
 * the one it corrects. Pure functions over plain data (ledger.ts feeds them the book).
 */
export interface CorporateRow {
  id: string;
  kind: CorporateKind;
  ticker: string;
  /** The hand-entered holding it changed (bonus, rights); null for a dividend. */
  holding_id: string | null;
  occurred_at: string;
  recorded_at: string;
  /** Dividend: cash received. Rights: cash paid. */
  net_try: number | null;
  gross_try: number | null;
  qty_added: number | null;
  qty_before: number | null;
  price: number | null;
  note: string;
  corrects: string | null;
  notice_id: string | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export const isUndone = (rows: readonly CorporateRow[], id: string) => rows.some((r) => r.corrects === id);

/** The records that still count: neither a correction row nor one that was corrected. */
export const liveRows = (rows: readonly CorporateRow[] | undefined): CorporateRow[] => (rows ?? []).filter((r) => r.corrects === null && !isUndone(rows ?? [], r.id));

/** Cash the actions moved: dividends in, rights payments out. Never an outside flow. */
export function corporateCash(rows: readonly CorporateRow[] | undefined): number {
  return cents(liveRows(rows).reduce((sum, r) => sum + (r.kind === "dividend" ? (r.net_try ?? 0) : r.kind === "rights" ? -(r.net_try ?? 0) : 0), 0));
}

/** Shares and cost a hand-entered holding gained from bonus and rights issues (`bonus`: the free shares among them). */
export function extrasOf(rows: readonly CorporateRow[] | undefined, holdingId: string): { qty: number; cost: number; bonus: number } {
  return liveRows(rows)
    .filter((r) => r.holding_id === holdingId)
    .reduce(
      (sum, r) => ({ qty: sum.qty + (r.qty_added ?? 0), cost: sum.cost + (r.kind === "rights" ? (r.net_try ?? 0) : 0), bonus: sum.bonus + (r.kind === "bonus" ? (r.qty_added ?? 0) : 0) }),
      { qty: 0, cost: 0, bonus: 0 },
    );
}
