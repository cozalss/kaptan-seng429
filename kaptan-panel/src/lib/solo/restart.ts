import type { RiskStatus } from "@/lib/domain";
import type { KaptanApi } from "@/lib/api/types";

/**
 * The restart after a stop (06 §11): one person asks and confirms. With real data confirm opens
 * only at `reset.ready_at`; `null` or a time already past means it can be confirmed
 * now, so one press does both.
 */
export function isWaiting(risk: RiskStatus): boolean {
  const readyAt = risk.reset?.ready_at ?? null;
  return readyAt !== null && Date.parse(readyAt) > Date.parse(risk.as_of);
}

/** Ask if not asked yet, then confirm unless the wait is still running. Returns the new status. */
export async function requestRestart(api: KaptanApi, risk: RiskStatus, reason: string): Promise<RiskStatus> {
  const asked = risk.reset?.started ? risk : await api.startKillReset({ reason });
  return isWaiting(asked) ? asked : api.confirmKillReset({ reason });
}
