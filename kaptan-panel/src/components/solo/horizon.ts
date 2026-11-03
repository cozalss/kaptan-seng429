import type { Position } from "@/lib/domain";
import type { EquityPoint } from "@/lib/solo/overview";
import { dayLabel, fmtLira } from "@/lib/solo/words";

/**
 * The home's horizon in plain terms: the sentence the day opens with, where each point of the
 * money line falls in real pixels, the days money moved, and what a scrubbed day says.
 */

export type DayMood = "up" | "down" | "flat" | "closed" | "unknown" | "new";

export interface DaySentence {
  mood: DayMood;
  /** The sentence's two lines. In `amount` the figure is split out so the ₺ can be set apart. */
  first: string;
  second: { amount: number | null; rest: string };
}

/** Today's move in ₺ from the day's % on the total. */
export function todayAmount(equityNow: number, pct: number): number {
  return pct <= -1 ? 0 : equityNow - equityNow / (1 + pct);
}

/**
 * The one big sentence. A market-closed day says so before anything else; a person with nothing
 * yet moved hears that their money is ready; an unknown day claims nothing.
 */
export function daySentence(input: { equityNow: number; todayPct: number | null; tradingDay: boolean; started: boolean }): DaySentence {
  const { equityNow, todayPct, tradingDay, started } = input;
  if (!started) return { mood: "new", first: "Paran hazır,", second: { amount: null, rest: "KAPtan okuyor." } };
  if (!tradingDay) return { mood: "closed", first: "Borsa bugün kapalı.", second: { amount: null, rest: "Paran yerinde." } };
  if (todayPct === null) return { mood: "unknown", first: "Rakamlar", second: { amount: null, rest: "henüz gelmedi." } };
  const amount = Math.round(todayAmount(equityNow, todayPct));
  if (amount === 0) return { mood: "flat", first: "Paran bugün", second: { amount: null, rest: "yerinde duruyor." } };
  if (amount > 0) return { mood: "up", first: "Paran bugün", second: { amount, rest: "arttı." } };
  return { mood: "down", first: "Paran bugün", second: { amount: -amount, rest: "azaldı." } };
}

/** "Başladığın yerden 12.400 ₺ yukarıda." and friends: the difference from the start, in words. */
export function differenceWords(equity: number, capitalStart: number): string {
  const delta = Math.round(equity - capitalStart);
  if (delta === 0) return "Tam başladığın yerde.";
  return `Başladığın yerden ${fmtLira(Math.abs(delta))} ${delta > 0 ? "yukarıda" : "aşağıda"}.`;
}

/** A day money moved, on the line. */
export interface MoneyMark {
  /** The point's index in the period's series. */
  index: number;
  date: string;
  /** "THYAO aldın" / "THYAO, ASELS aldın". */
  text: string;
  /** "FRZEN aldın · 49.770 ₺" with the money it moved. */
  sentence: string;
}

/**
 * The buys that filled inside this period, one mark per day, each on the first series point on or
 * after its day (a fill on a day with no point lands on the next one). Only what `positions` says
 * happened; nothing is inferred.
 */
export function moneyMarks(points: readonly EquityPoint[], positions: readonly Position[]): MoneyMark[] {
  const byDay = new Map<number, Position[]>();
  for (const p of positions) {
    const day = p.opened_at.slice(0, 10);
    const index = points.findIndex((pt) => pt.date.slice(0, 10) >= day);
    if (index >= 0) byDay.set(index, [...(byDay.get(index) ?? []), p]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, ps]) => {
      const names = ps.map((p) => p.ticker).join(", ");
      const money = ps.reduce((s, p) => s + p.qty * p.avg_cost, 0);
      return { index, date: points[index]?.date ?? "", text: `${names} aldın`, sentence: `${names} aldın · ${fmtLira(money)}` };
    });
}

const MIN_LINE_HEIGHT = 60;

export interface PlotBox {
  width: number;
  /** The plot's height: the line lives inside it. */
  height: number;
  /** Air kept above the highest value (the boat's mast, a pin's label). */
  top: number;
  /** Water kept under the lowest value. */
  bottom: number;
  /** Open water to the right of today, so the boat is not on the window's edge. */
  right: number;
  /** The words over the sky: the line stays under each one's foot until it is past its right edge. */
  clear: ReadonlyArray<{ right: number; bottom: number }>;
}

export interface PlotGeometry {
  xy: Array<{ x: number; y: number }>;
  line: string;
  waterY: number;
}

/**
 * The money line in real pixels. The scale always includes the starting amount, so the waterline
 * is always on screen and "above or below where I began" is always visible.
 */
export function plotGeometry(points: readonly EquityPoint[], capitalStart: number, box: PlotBox): PlotGeometry | null {
  if (points.length < 2) return null;
  const values = [...points.map((p) => p.equity), capitalStart];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // A line that barely moved stays calm: never scale a few liras up into a mountain.
  const span = Math.max(hi - lo, hi * 0.004, 1);
  const base = box.height - box.bottom;
  const usable = Math.max(1, box.width - box.right);
  const n = points.length - 1;
  const xs = points.map((_, i) => (i / n) * usable);
  const lift = (v: number) => (v - lo) / span;
  // As tall as the sky allows: full height at the right, under the words on the left.
  const under = (x: number, v: number) => box.clear.map((c) => (x < c.right && lift(v) > 0 ? (base - c.bottom) / lift(v) : Infinity));
  const limits = [base - box.top, ...under(0, capitalStart), ...points.flatMap((p, i) => under(xs[i] ?? 0, p.equity))];
  const tall = Math.max(MIN_LINE_HEIGHT, Math.min(...limits));
  const yOf = (v: number) => base - lift(v) * tall;
  const xy = points.map((p, i) => ({ x: xs[i] ?? 0, y: yOf(p.equity) }));
  const line = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
  return { xy, line, waterY: yOf(capitalStart) };
}

/** Not enough days for a line: the boat rests on the waterline, where the person starts. */
export function restGeometry(box: PlotBox): PlotGeometry {
  const waterY = box.height - box.bottom;
  const x = Math.max(1, box.width - box.right);
  return { xy: [{ x, y: waterY }], line: "", waterY };
}

/** The boat's lean at a point, from the line's local slope: a little, never capsizing. */
export function boatLean(xy: ReadonlyArray<{ x: number; y: number }>, i: number): number {
  const a = xy[Math.max(0, i - 1)];
  const b = xy[Math.min(xy.length - 1, i + 1)];
  if (!a || !b || b.x === a.x) return 0;
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return Math.max(-9, Math.min(9, deg * 0.6));
}

/** What the slider reads out, and the visible readout's words for a day. */
export function dayReading(point: EquityPoint, capitalStart: number, mark: MoneyMark | undefined): string {
  const base = `${dayLabel(point.date)}: ${fmtLira(point.equity)}. ${differenceWords(point.equity, capitalStart)}`;
  return mark ? `${base} ${mark.sentence}.` : base;
}
