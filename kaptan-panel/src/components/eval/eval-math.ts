import type { EvalSummary, HoldoutRow, PnlPoint } from "@/lib/domain";
import type { Role } from "@/lib/domain/user";

/**
 * Pure helpers for /eval (FRONTEND-SPEC §2.9, 08). Targets are the canonical ones (08 table
 * "Kanonik değerlendirme hedefleri"); nothing here judges a sample value as a real result.
 */
export const TARGETS = {
  macroF1: 0.85,
  kappa: 0.7,
  ece: 0.1,
  xRecall: 0.95,
  faithfulness: 0.85,
  contextPrecision: 0.7,
  contextRecall: 0.75,
  blockRate: 0.95,
  falseAlarmInfo: 0.02,
  p95Seconds: 60,
} as const;

/** Pre-registered primary windows (08 §4 / 06 §12): E1, E2 CAR[+1,+20]; E3, E4 CAR[+1,+5]. */
export const PRIMARY_WINDOW: Readonly<Record<HoldoutRow["event_type"], keyof HoldoutRow | null>> = {
  E1: "car_20",
  E2: "car_20",
  E3: "car_5",
  E4: "car_5",
  ALL: null,
};

export function isPrimary(row: Pick<HoldoutRow, "event_type">, key: keyof HoldoutRow): boolean {
  return PRIMARY_WINDOW[row.event_type] === key;
}

/** Row-normalised confusion matrix (share of each gold class), for the heat map. */
export function rowShares(m: readonly (readonly number[])[]): number[][] {
  return m.map((row) => {
    const total = row.reduce((a, b) => a + b, 0);
    return row.map((v) => (total ? v / total : 0));
  });
}

/** Sequential single-hue cell fill (indigo wash) and the text colour that keeps AA on it. */
export function heatCell(share: number): { background: string; dark: boolean } {
  // Two bands so text always keeps AA: ink text up to 60 % wash, light text from 80 % wash.
  const s = Math.min(1, Math.max(0, share));
  const dark = s >= 0.5;
  const a = dark ? 0.8 + (s - 0.5) * 0.3 : s * 1.2;
  return { background: `rgb(43 66 97 / ${Math.round(a * 100) / 100})`, dark };
}

/** 0…1 position of a value on a [0, max] bullet scale. */
export function bulletFraction(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/** Cumulative return of one strategy over the window shared by all fwd series (from v1.1 start). */
export function commonPeriodReturn(series: readonly PnlPoint[], strategy: string, from: string): number | null {
  const pts = series.filter((p) => p.strategy === strategy && p.d >= from).sort((a, b) => a.d.localeCompare(b.d));
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return null;
  const base = first.equity / (1 + first.daily_return);
  return last.equity / base - 1;
}

/** KAPtan v1.1 minus BIST-100 over the common period (the headline the demo is asked about). */
export function excessVsBist(e: Pick<EvalSummary, "l4">): number | null {
  const k = commonPeriodReturn(e.l4.series, "kaptan:v1.1-fwd", e.l4.since.v1_1);
  const b = commonPeriodReturn(e.l4.series, "baseline:xu100_bh", e.l4.since.v1_1);
  return k === null || b === null ? null : k - b;
}

/** Token, quota and cost panel: R D U (FRONTEND-SPEC §2.9); Analyst sees a "no permission" state. */
export function canSeeCost(role: Role): boolean {
  return role !== "analyst";
}

/** Share of malicious cases per behaviour code (Q/N/H/F, 08 §7.1). */
export function codeShares(by: Readonly<Record<"Q" | "N" | "H" | "F", number>>): Array<{ code: "Q" | "N" | "H" | "F"; n: number; share: number }> {
  const total = by.Q + by.N + by.H + by.F;
  return (["Q", "N", "H", "F"] as const).map((code) => ({ code, n: by[code], share: total ? by[code] / total : 0 }));
}

/** "0,86" — two-decimal ratios as the docs write them. */
export function fmtRatio(v: number, digits = 2): string {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}
