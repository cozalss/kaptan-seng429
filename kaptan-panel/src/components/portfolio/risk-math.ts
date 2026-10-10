import type { Position } from "@/lib/domain";
import { addDays, ISTANBUL_OFFSET_H, tradingDaysBetween } from "@/lib/time";

/** Pure portfolio logic for /portfoy (SPEC §2.6). Unit-tested in risk-math.test.ts. */

/** Istanbul calendar date (YYYY-MM-DD) of an instant. */
export function istanbulDate(ms: number): string {
  return new Date(ms + ISTANBUL_OFFSET_H * 3_600_000).toISOString().slice(0, 10);
}

/** Sessions from one date to another, not counting the start day (0 when to ≤ from). */
export function sessionsBetween(from: string, to: string): number {
  if (to <= from) return 0;
  return tradingDaysBetween(addDays(from, 1), to).length;
}

export interface HoldingProgress {
  elapsed: number;
  planned: number;
  /** 0…1 share of the plan already held. */
  fraction: number;
  dueToday: boolean;
  overdue: boolean;
}

/** Holding days in sessions vs the plan (entry → planned exit). */
export function holdingProgress(p: Pick<Position, "opened_at" | "planned_exit_date">, today: string): HoldingProgress {
  const opened = istanbulDate(Date.parse(p.opened_at));
  const planned = Math.max(1, sessionsBetween(opened, p.planned_exit_date));
  const elapsed = sessionsBetween(opened, today);
  return {
    elapsed,
    planned,
    fraction: Math.min(1, elapsed / planned),
    dueToday: p.planned_exit_date === today,
    overdue: p.planned_exit_date < today,
  };
}

export function positionReturn(p: Pick<Position, "avg_cost" | "last_price">): number {
  return p.last_price / p.avg_cost - 1;
}
