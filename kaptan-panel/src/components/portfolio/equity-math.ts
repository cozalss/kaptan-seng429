import type { PnlPoint } from "@/lib/domain";

/**
 * Pure geometry of the equity line (portfolio-logic.test.ts). The chart is drawn in a
 * 640 × 160 box stretched to its slot, so every place is also given in percent for the HTML
 * marks laid over it (dots, labels, the crosshair stay round and readable at any width).
 */
export const W = 640;
export const H = 160;
const PAD_X = 6;
/** Room above the peak rule and under the −5% rule for their 12px labels. */
const PAD_Y = 22;
/** The y-range never spans less than ±2% of the mean, so a quiet week stays a quiet line. */
const MIN_HALF_RANGE = 0.02;
/** Zirveden −%5: the risk monitor stops everything there (SPEC §2.5, R01). */
export const STOP_DRAWDOWN = 0.05;

export interface EquityPoint {
  d: string;
  equity: number;
}

/** The live strategy's closes, newest `n`, with today's intraday value appended. */
export function equitySeries(pnl: readonly PnlPoint[], strategy: string, today: EquityPoint | null, n = 40): EquityPoint[] {
  const closes = pnl.filter((p) => p.strategy === strategy).map((p) => ({ d: p.d, equity: p.equity }));
  const base = today ? closes.filter((p) => p.d < today.d) : closes;
  return [...base.slice(-n), ...(today ? [today] : [])];
}

/** Sessions from the first point to the last, and the change over them ("40 seansta +%1,6"). */
export function seriesChange(points: readonly EquityPoint[]): { sessions: number; ratio: number } | null {
  if (points.length < 2) return null;
  const first = points[0] as EquityPoint;
  const last = points[points.length - 1] as EquityPoint;
  return { sessions: points.length - 1, ratio: last.equity / first.equity - 1 };
}

/** The y-range drawn: the data's own range, widened to at least ±2% of the mean. */
export function yDomain(vals: readonly number[]): { lo: number; hi: number } {
  const mean = vals.reduce((sum, v) => sum + v, 0) / vals.length;
  const lo = Math.min(...vals, mean * (1 - MIN_HALF_RANGE));
  const hi = Math.max(...vals, mean * (1 + MIN_HALF_RANGE));
  return hi > lo ? { lo, hi } : { lo: lo - 1, hi: hi + 1 };
}

export interface Mark {
  x: number;
  y: number;
}

export interface EquityGeometry {
  line: string;
  area: string;
  /** Every point in the 640 × 160 box. */
  xy: Mark[];
  last: Mark | null;
  /** y of the peak and of the −5% stop level, when a peak is given. */
  peakY: number | null;
  stopY: number | null;
}

/**
 * The line, its hatched area, and (given the peak) the two levels that matter: the peak and
 * the −5% stop under it. Both levels are inside the y-range, so the distance to the stop is
 * drawn honestly, never cropped away.
 */
export function linePath(points: readonly EquityPoint[], peak: number | null = null): EquityGeometry {
  const none = { line: "", area: "", xy: [], last: null, peakY: null, stopY: null };
  if (points.length < 2) return none;
  const levels = peak ? [peak, peak * (1 - STOP_DRAWDOWN)] : [];
  const { lo, hi } = yDomain([...points.map((p) => p.equity), ...levels]);
  const top = peak ? PAD_Y : 6;
  const bottom = peak ? PAD_Y : 6;
  const yOf = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);
  const xy = points.map((p, i) => ({ x: PAD_X + (i / (points.length - 1)) * (W - 2 * PAD_X), y: yOf(p.equity) }));
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const first = xy[0] as Mark;
  const last = xy[xy.length - 1] as Mark;
  return {
    line,
    area: `${line} L${last.x.toFixed(1)} ${H} L${first.x.toFixed(1)} ${H} Z`,
    xy,
    last,
    peakY: peak ? yOf(peak) : null,
    stopY: peak ? yOf(peak * (1 - STOP_DRAWDOWN)) : null,
  };
}

/** The point nearest to a horizontal position given as a 0…1 share of the chart's width. */
export function nearestIndex(share: number, count: number): number {
  if (count < 2) return 0;
  const inner = (share * W - PAD_X) / (W - 2 * PAD_X);
  return Math.min(count - 1, Math.max(0, Math.round(inner * (count - 1))));
}

/** A place in the box as CSS percentages, for the HTML marks laid over the SVG. */
export function pct(m: Mark): { left: string; top: string } {
  return { left: `${(m.x / W) * 100}%`, top: `${(m.y / H) * 100}%` };
}
