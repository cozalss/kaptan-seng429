import type { EquityPoint } from "./overview";

/** The chart's period toggle: last month, last three months, everything. */
export const PERIODS = ["1A", "3A", "Tümü"] as const;
export type Period = (typeof PERIODS)[number];

const MONTHS: Readonly<Record<Period, number | null>> = { "1A": 1, "3A": 3, Tümü: null };

export const PERIOD_LABEL: Readonly<Record<Period, string>> = { "1A": "Son 1 ay", "3A": "Son 3 ay", Tümü: "Başından beri" };

/** YYYY-MM-DD minus `months` calendar months (day clamped to the month's end). */
export function monthsBefore(date: string, months: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** The points inside a period, counted back from the last point (never fewer than two). */
export function filterPeriod(series: readonly EquityPoint[], period: Period): EquityPoint[] {
  const months = MONTHS[period];
  const last = series[series.length - 1];
  if (months === null || !last) return [...series];
  const from = monthsBefore(last.date, months);
  const inside = series.filter((p) => p.date.slice(0, 10) >= from);
  return inside.length >= 2 ? inside : series.slice(-2);
}

/** A period worth offering: it shows less than everything (else it would equal "Tümü"). */
export function periodIsDistinct(series: readonly EquityPoint[], period: Period): boolean {
  if (period === "Tümü") return true;
  return filterPeriod(series, period).length < series.length;
}

export interface ChartGeometry {
  /** x, y in a 0–1000 × 0–300 box (y grows down). */
  xy: Array<{ x: number; y: number }>;
  line: string;
  area: string;
  min: number;
  max: number;
  /** y of a value inside the box (for reference lines and ticks). */
  yOf: (v: number) => number;
  ticks: number[];
}

export const CHART_W = 1000;
export const CHART_H = 300;
const PAD_TOP = 16;
const PAD_BOTTOM = 8;

/** Three round tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 3): number[] {
  const span = Math.max(1, max - min);
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v));
  return out;
}

/**
 * Lay the series into the chart box. The y range always includes `baseline` (the money you
 * started with) so "above or below where I began" is visible, with 8% air above and below.
 */
export function chartGeometry(points: readonly EquityPoint[], baseline: number | null): ChartGeometry | null {
  if (points.length < 2) return null;
  const values = points.map((p) => p.equity);
  if (baseline !== null) values.push(baseline);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const air = Math.max((hi - lo) * 0.08, hi * 0.002, 1);
  const min = lo - air;
  const max = hi + air;
  const yOf = (v: number) => PAD_TOP + (1 - (v - min) / (max - min)) * (CHART_H - PAD_TOP - PAD_BOTTOM);
  const n = points.length - 1;
  const xy = points.map((p, i) => ({ x: (i / n) * CHART_W, y: yOf(p.equity) }));
  const line = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${CHART_W} ${CHART_H} L0 ${CHART_H} Z`;
  return { xy, line, area, min, max, yOf, ticks: niceTicks(lo, hi) };
}

/** The point nearest to a 0–1 position along the x axis. */
export function nearestPoint(fraction: number, count: number): number {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(fraction * (count - 1))));
}
