import { istanbulMinutes, isTradingDay, nextTradingDay, prevTradingDay } from "./time";

/** Before this many disclosures and before 10:00, a session day has not really started yet. */
export const QUIET_DAY_TOTAL = 10;
const SESSION_OPEN_MIN = 10 * 60;

export interface SessionView {
  /** The Istanbul calendar day of "now" (YYYY-MM-DD). */
  today: string;
  /** The day whose disclosures Bugün shows: today, or the last session when today is quiet. */
  shown: string;
  /** True when `shown` is an earlier session than today. */
  previous: boolean;
  /** Today is a weekend or a holiday. */
  closed: boolean;
  /** The next session day after today (for "sıradaki seans"). */
  next: string;
}

/** YYYY-MM-DD of an instant on the Istanbul clock. */
export function istanbulDay(ms: number): string {
  return new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Pure. Which day Bugün should talk about. On a weekend or holiday it is the last session; on
 * a session day that has barely begun (before 10:00, fewer than QUIET_DAY_TOTAL notices read)
 * it is also the last session, so the desk never opens on an empty page.
 */
export function sessionView(nowMs: number, todayTotal: number | null): SessionView {
  const today = istanbulDay(nowMs);
  const closed = !isTradingDay(today);
  const early = !closed && todayTotal !== null && todayTotal < QUIET_DAY_TOTAL && istanbulMinutes(new Date(nowMs).toISOString()) < SESSION_OPEN_MIN;
  const previous = closed || early;
  return { today, shown: previous ? prevTradingDay(today) : today, previous, closed, next: nextTradingDay(today) };
}

const dayFmt = new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "long", weekday: "long" });

/** "30 Ekim Cuma" for a YYYY-MM-DD. */
export function dayLabel(day: string): string {
  const parts = dayFmt.formatToParts(new Date(`${day}T12:00:00Z`));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("weekday")}`;
}
