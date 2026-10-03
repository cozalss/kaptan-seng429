import type { EvidenceEvent } from "@/lib/domain";

/**
 * Abnormal-return distribution of the selected similar events per horizon, computed in
 * code from `event_returns` rows (05 EvidenceCard: the LLM selects, code computes).
 */
export type Horizon = "car_1d" | "car_5d" | "car_20d" | "car_60d";
export const HORIZONS: ReadonlyArray<{ key: Horizon; label: string; days: number }> = [
  { key: "car_1d", label: "1 gün", days: 1 },
  { key: "car_5d", label: "5 gün", days: 5 },
  { key: "car_20d", label: "20 gün", days: 20 },
  { key: "car_60d", label: "60 gün", days: 60 },
];

export interface Distribution {
  key: Horizon;
  label: string;
  values: number[];
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  hitRate: number;
}

/** Linear-interpolated quantile (type 7, as numpy's default) of sorted values. */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

export function distribution(events: readonly EvidenceEvent[], key: Horizon, label: string): Distribution | null {
  const values = events.map((e) => e[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    key,
    label,
    values,
    n: sorted.length,
    min: sorted[0] as number,
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1] as number,
    mean: sum / sorted.length,
    hitRate: sorted.filter((v) => v > 0).length / sorted.length,
  };
}

export function distributions(events: readonly EvidenceEvent[]): Distribution[] {
  return HORIZONS.map((h) => distribution(events, h.key, h.label)).filter((d): d is Distribution => d !== null);
}

/** A symmetric-enough domain that always contains 0, padded and rounded to 1%. */
export function chartDomain(dists: readonly Distribution[]): [number, number] {
  if (dists.length === 0) return [-0.05, 0.05];
  const lo = Math.min(0, ...dists.map((d) => d.min));
  const hi = Math.max(0, ...dists.map((d) => d.max));
  const pad = Math.max(0.005, (hi - lo) * 0.06);
  return [Math.floor((lo - pad) * 100) / 100, Math.ceil((hi + pad) * 100) / 100];
}

/** Position of a value inside the domain, as a percentage (0–100, clamped). */
export function pctOf(v: number, [lo, hi]: readonly [number, number]): number {
  const span = hi - lo || 1;
  return Math.min(100, Math.max(0, ((v - lo) / span) * 100));
}

/** Ticks every 5% (or 10% on wide domains), always including 0. */
export function ticks([lo, hi]: readonly [number, number]): number[] {
  const step = hi - lo > 0.3 ? 0.1 : hi - lo > 0.12 ? 0.05 : 0.02;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  if (!out.some((t) => Math.abs(t) < 1e-9)) out.push(0);
  return out.sort((a, b) => a - b);
}

/** Deterministic vertical jitter (0–1) so overlapping dots stay readable. */
export function jitter(i: number): number {
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
