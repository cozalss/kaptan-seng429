import type { PersonalReset } from "@/lib/domain";
import { istanbulIso, ISTANBUL_OFFSET_H, nextTradingDay } from "@/lib/time";

/**
 * The personal kill-switch reset rule (06 §11 step 3, 12 §8/4, _KANONIK "Kişisel mod"):
 * two written confirmations by you, ≥ 24 h apart, and ≥ 5 sessions closed since the trigger.
 * Pure functions: the mock API and the UI read the same answer.
 */
export const RESET_SESSIONS_REQUIRED = 5;
export const RESET_MIN_GAP_H = 24;
/** A session counts once its closing auction is over (18:10 Istanbul). */
const SESSION_CLOSE = "18:10";

const istDate = (iso: string) => new Date(Date.parse(iso) + ISTANBUL_OFFSET_H * 3_600_000).toISOString().slice(0, 10);

/** Close time of the n-th trading session after the trigger day (the trigger day itself never counts). */
export function nthSessionCloseAfter(killIso: string, n: number): string {
  let d = istDate(killIso);
  for (let i = 0; i < n; i += 1) d = nextTradingDay(d);
  return istanbulIso(d, SESSION_CLOSE);
}

/** Sessions fully closed after the trigger day, as of `nowIso` (capped at `cap`). */
export function sessionsClosedSince(killIso: string, nowIso: string, cap = 60): number {
  const now = Date.parse(nowIso);
  let n = 0;
  while (n < cap && Date.parse(nthSessionCloseAfter(killIso, n + 1)) <= now) n += 1;
  return n;
}

export function personalReset(killIso: string, first: { at: string; reason: string } | null, nowIso: string): PersonalReset {
  const sessions = sessionsClosedSince(killIso, nowIso, RESET_SESSIONS_REQUIRED);
  const sessionsReadyAt = nthSessionCloseAfter(killIso, RESET_SESSIONS_REQUIRED);
  const secondAllowedAt = first ? new Date(Date.parse(first.at) + RESET_MIN_GAP_H * 3_600_000).toISOString() : null;
  const readyAt = secondAllowedAt ? new Date(Math.max(Date.parse(secondAllowedAt), Date.parse(sessionsReadyAt))).toISOString() : null;
  const nextStep: PersonalReset["next_step"] = !first ? "first" : readyAt && Date.parse(readyAt) <= Date.parse(nowIso) ? "second" : "wait";
  return {
    sessions_since_kill: sessions,
    sessions_required: RESET_SESSIONS_REQUIRED,
    sessions_ready_at: sessionsReadyAt,
    min_gap_hours: RESET_MIN_GAP_H,
    first,
    second_allowed_at: secondAllowedAt,
    next_step: nextStep,
    ready_at: readyAt,
  };
}
