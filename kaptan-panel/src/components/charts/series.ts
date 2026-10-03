import type { PnlPoint } from "@/lib/domain";

/**
 * Strategy encoding for every P&L chart (08 §8.1: "stratejiler arasında tutarlı renk eşlemesi").
 * Emphasis, not a rainbow: KAPtan's live arm is the one ink line; baselines recede. Identity
 * never rests on colour alone — each series also has its own dash pattern, a legend entry and
 * a direct end label, and every chart has a table view (dataviz: validated pairs
 * indigo↔gray ΔE 16, ink↔indigo ΔE 35; ink↔ink-dashed separated by dash only).
 */
export const FWD_STRATEGIES = ["kaptan:v1.1-fwd", "kaptan:v1.0-fwd", "baseline:xu100_bh", "baseline:ew_universe"] as const;
export type FwdStrategy = (typeof FWD_STRATEGIES)[number];

export interface SeriesStyle {
  label: string;
  short: string;
  color: string;
  dash?: string;
  width: number;
  /** Plain-language role, read by screen readers and the table view. */
  role: string;
}

export const SERIES_STYLE: Readonly<Record<FwdStrategy, SeriesStyle>> = {
  "kaptan:v1.1-fwd": { label: "KAPtan v1.1-fwd", short: "v1.1", color: "var(--ink)", width: 2.25, role: "tüm ajanlar (23 Kas →)" },
  "kaptan:v1.0-fwd": { label: "KAPtan v1.0-fwd", short: "v1.0", color: "var(--ink)", dash: "6 4", width: 1.5, role: "sınıflandırıcı + kurallar (9 Kas →)" },
  "baseline:xu100_bh": { label: "BIST-100 al-tut", short: "BIST-100", color: "#3d6aa6", width: 1.75, role: "B0 karşılaştırma" },
  "baseline:ew_universe": { label: "Eşit ağırlıklı evren", short: "Eşit ağ.", color: "#8c8a84", dash: "1.5 3.5", width: 2, role: "B1 karşılaştırma" },
};

export interface ReturnRow {
  d: string;
  /** Marks the intraday point appended from the live risk status. */
  live?: boolean;
  values: Partial<Record<FwdStrategy, number | null>>;
}

/**
 * Pivot P&L points into one row per date with cumulative return per strategy.
 * Without `rebaseFrom`, returns are against each series' own start capital (equity / first − 1).
 * With `rebaseFrom`, every series is reset to 0 on that date (the common period, 08 §4 A0).
 */
export function cumulativeReturns(points: readonly PnlPoint[], strategies: readonly FwdStrategy[], rebaseFrom?: string): ReturnRow[] {
  const byDate = new Map<string, ReturnRow>();
  for (const s of strategies) {
    const pts = points.filter((p) => p.strategy === s && (!rebaseFrom || p.d >= rebaseFrom)).sort((a, b) => a.d.localeCompare(b.d));
    const first = pts[0];
    if (!first) continue;
    // Each fwd series starts at 1.000.000 TL; the first point already carries day-1 P&L.
    const base = rebaseFrom ? first.equity : first.equity / (1 + first.daily_return);
    for (const p of pts) {
      const row = byDate.get(p.d) ?? { d: p.d, values: {} };
      byDate.set(p.d, { ...row, values: { ...row.values, [s]: p.equity / base - 1 } });
    }
  }
  return [...byDate.values()].sort((a, b) => a.d.localeCompare(b.d));
}

/** Append today's intraday point for one strategy, compounding the live daily P&L. */
export function withLivePoint(rows: readonly ReturnRow[], strategy: FwdStrategy, today: string, dailyPnl: number): ReturnRow[] {
  const last = [...rows].reverse().find((r) => typeof r.values[strategy] === "number");
  if (!last || last.d >= today) return [...rows];
  const prev = last.values[strategy] as number;
  return [...rows, { d: today, live: true, values: { [strategy]: (1 + prev) * (1 + dailyPnl) - 1 } }];
}

export interface DrawdownRow {
  d: string;
  live?: boolean;
  drawdown: number;
  daily: number;
}

/** One strategy's drawdown and daily return, plus the live intraday values when given. */
export function drawdownRows(points: readonly PnlPoint[], strategy: FwdStrategy, live?: { today: string; drawdown: number; daily: number }): DrawdownRow[] {
  const rows: DrawdownRow[] = points
    .filter((p) => p.strategy === strategy)
    .sort((a, b) => a.d.localeCompare(b.d))
    .map((p) => ({ d: p.d, drawdown: p.drawdown, daily: p.daily_return }));
  const last = rows[rows.length - 1];
  if (live && (!last || last.d < live.today)) rows.push({ d: live.today, live: true, drawdown: Math.min(0, live.drawdown), daily: live.daily });
  return rows;
}

/** Last value of each strategy (for end labels, summaries and the screen-reader description). */
export function lastValues(rows: readonly ReturnRow[], strategies: readonly FwdStrategy[]): Partial<Record<FwdStrategy, number>> {
  const out: Partial<Record<FwdStrategy, number>> = {};
  for (const s of strategies) {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const v = rows[i]?.values[s];
      if (typeof v === "number") {
        out[s] = v;
        break;
      }
    }
  }
  return out;
}

/** "Nice" symmetric-ish domain for a return axis, always including 0 and the given floors. */
export function returnDomain(values: readonly number[], include: readonly number[] = [0]): [number, number] {
  const all = [...values, ...include];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = Math.max(0.002, (hi - lo) * 0.08);
  const step = 0.005;
  return [Math.floor((lo - pad) / step) * step, Math.ceil((hi + pad) / step) * step];
}

/** Evenly spaced ticks (1/2/5 × 10ⁿ steps) covering a domain, for honest, readable axes. */
export function niceTicks([lo, hi]: readonly [number, number], target = 5): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / Math.max(1, target - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
  const out: number[] = [];
  const end = Math.ceil(hi / step - 1e-9) * step;
  for (let v = Math.floor(lo / step + 1e-9) * step; v <= end + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out.map((v) => (Object.is(v, -0) ? 0 : Number(v.toFixed(10))));
}

export interface EndLabel {
  key: string;
  text: string;
  y: number;
}

/** Push end labels apart so none overlap (min gap in px), keeping their order by value. */
export function spreadLabels(labels: readonly EndLabel[], minGap: number, top: number, bottom: number): EndLabel[] {
  const sorted = [...labels].sort((a, b) => a.y - b.y).map((l) => ({ ...l, y: Math.min(bottom, Math.max(top, l.y)) }));
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1] as EndLabel;
    const cur = sorted[i] as EndLabel;
    if (cur.y - prev.y < minGap) sorted[i] = { ...cur, y: prev.y + minGap };
  }
  const overflow = (sorted[sorted.length - 1]?.y ?? 0) - bottom;
  if (overflow > 0) {
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const cur = sorted[i] as EndLabel;
      const next = sorted[i + 1];
      const limit = next ? next.y - minGap : bottom;
      sorted[i] = { ...cur, y: Math.min(cur.y, limit) };
    }
  }
  return sorted;
}
