import type { MoneyMovement } from "./money";
import type { EquityPoint } from "./overview";

/**
 * Money the person moved by hand is not a gain or a loss. The home's line is therefore drawn
 * from each day's distance to the money put in by that day, never from the raw total: a deposit
 * lifts the total and the money put in by the same lira, and the line does not move.
 */

/** YYYY-MM-DD of an instant on the Istanbul clock (UTC+3 all year). */
const istanbulDayOf = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);

/** A withdrawal takes money out; a start, a deposit and a share added by hand put it in. */
export function signedFlow(m: Pick<MoneyMovement, "kind" | "amount_try">): number {
  return m.kind === "withdrawal" ? -m.amount_try : m.amount_try;
}

/** Money put in by the end of an Istanbul day. */
export function putInAt(movements: readonly MoneyMovement[], day: string): number {
  return movements.reduce((sum, m) => (istanbulDayOf(m.occurred_at) <= day.slice(0, 10) ? sum + signedFlow(m) : sum), 0);
}

/**
 * The daily closes plus "now": the series holds closed days only, so today's point is the live
 * total (replacing today's own point if the API already sent one). `today` null = clock unknown.
 */
export function withToday(series: readonly EquityPoint[], today: string | null, equityNow: number): EquityPoint[] {
  if (today === null) return [...series];
  const closed = series.filter((p) => p.date.slice(0, 10) < today);
  return [...closed, { date: today, equity: equityNow }];
}

export interface HorizonPoint extends EquityPoint {
  /** Money put in by the end of that day. */
  put_in: number;
}

/**
 * Each day with the money put in by then. Without the movements (the call failed) every day is
 * measured against today's figure, as before. The last day always agrees with `capitalStart`,
 * which is the figure the rest of the screen states.
 */
export function horizonPoints(series: readonly EquityPoint[], movements: readonly MoneyMovement[] | null, capitalStart: number): HorizonPoint[] {
  if (!movements || series.length === 0) return series.map((p) => ({ ...p, put_in: capitalStart }));
  const last = series[series.length - 1] as EquityPoint;
  const drift = capitalStart - putInAt(movements, last.date);
  return series.map((p) => ({ ...p, put_in: Math.round((putInAt(movements, p.date) + drift) * 100) / 100 }));
}

/** How far a day stood above (or below) the money put in by then. */
export function gainOf(p: HorizonPoint): number {
  return p.equity - p.put_in;
}

/**
 * The line to draw: every day at "today's money put in, plus that day's gain". The waterline
 * stays one flat line (the money put in), and a deposit or a withdrawal leaves no step in it.
 */
export function levelSeries(points: readonly HorizonPoint[], capitalStart: number): EquityPoint[] {
  return points.map((p) => ({ date: p.date, equity: capitalStart + gainOf(p) }));
}

/**
 * The series the home draws: the closed days plus today's live total, each day at its gain over
 * the money put in by then, laid on today's money put in. `movements` null = the call failed.
 */
export function homeSeries(series: readonly EquityPoint[], movements: readonly MoneyMovement[] | null, today: string | null, equityNow: number, capitalStart: number): EquityPoint[] {
  const withNow = withToday(series, today, equityNow);
  return levelSeries(horizonPoints(withNow, movements, capitalStart), capitalStart);
}
