import type { PricePoint } from "./company";

export interface Rebased {
  /** The first day both series have a close: both lines start at 100 there. */
  from: string | null;
  days: string[];
  a: number[];
  b: number[];
}

/**
 * Two close series on a shared scale: each is divided by its own close on the first day both have one and
 * multiplied by 100, so "which did better" is the one that ends higher. Days only one series has are dropped,
 * never filled in. Empty when the series share fewer than two days.
 */
export function rebaseTo100(a: readonly PricePoint[], b: readonly PricePoint[]): Rebased {
  const bByDay = new Map(b.map((p) => [p.d, p.close]));
  const common = a.filter((p) => bByDay.has(p.d) && p.close > 0 && (bByDay.get(p.d) ?? 0) > 0);
  const first = common[0];
  if (common.length < 2 || !first) return { from: null, days: [], a: [], b: [] };
  const baseA = first.close;
  const baseB = bByDay.get(first.d) ?? 1;
  return {
    from: first.d,
    days: common.map((p) => p.d),
    a: common.map((p) => (p.close / baseA) * 100),
    b: common.map((p) => ((bByDay.get(p.d) ?? baseB) / baseB) * 100),
  };
}

/** Percent change of a rebased line from its start (100) to its end; null for an empty line. */
export function rebasedChange(line: readonly number[]): number | null {
  const last = line.at(-1);
  return last === undefined ? null : Math.round((last - 100) * 100) / 100;
}
