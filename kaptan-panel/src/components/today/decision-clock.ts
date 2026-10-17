import type { ApprovalCard } from "@/lib/domain";
import { fmtTime } from "@/lib/format";
import { dayWordTr, fmtCountdown } from "@/lib/time";

/** The day's decision time on Bugün: the soonest deadline among the open proposals. */
export interface DecisionClock {
  /** "yarın 09:50" */
  when: string;
  /** "20 saat 10 dakika kaldı" */
  left: string;
  /** Share of the decision window still left, 0…1 (from the proposal's arrival to its deadline). */
  remaining: number;
}

type Open = Pick<ApprovalCard, "created_at" | "expires_at">;

/**
 * Pure. Null when nothing is open or the clock is not known yet. The window is the soonest
 * card's own (created → expires), so the rule under the time shrinks as the day goes on.
 */
export function decisionClock(open: readonly Open[], nowMs: number | null): DecisionClock | null {
  if (nowMs === null || open.length === 0) return null;
  const first = open.reduce((a, b) => (Date.parse(b.expires_at) < Date.parse(a.expires_at) ? b : a));
  const end = Date.parse(first.expires_at);
  const start = Date.parse(first.created_at);
  const leftMs = end - nowMs;
  const span = end - start;
  const remaining = span > 0 ? Math.min(1, Math.max(0, leftMs / span)) : 0;
  const when = `${dayWordTr(first.expires_at, new Date(nowMs).toISOString())} ${fmtTime(first.expires_at)}`;
  const left = leftMs > 0 ? `${fmtCountdown(leftMs)} kaldı` : "süresi doldu";
  return { when, left, remaining };
}
