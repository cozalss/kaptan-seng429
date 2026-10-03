import type { KillResetRequest, LimitValue, Position, RiskStatus } from "@/lib/domain";
import { LIMITS_V1 } from "@/lib/domain";
import type { Role } from "@/lib/domain/user";
import { can } from "@/lib/auth/permissions";
import { addDays, ISTANBUL_OFFSET_H, tradingDaysBetween } from "@/lib/time";
import { accountName } from "@/lib/auth/accounts";

/**
 * Pure portfolio/risk logic for /portfolio (FRONTEND-SPEC §2.5, 06 §9–§11, 09 §5). No React here:
 * every rule the screen shows is unit-tested in risk-math.test.ts.
 */

export interface RiskLimits {
  dailyHalt: number;
  killDrawdown: number;
  maxPositions: number;
  targetPositions: number;
  maxPositionPct: number;
}

function valueOf(values: readonly LimitValue[], key: LimitValue["key"]): number | undefined {
  return values.find((v) => v.key === key)?.value;
}

/** Limits from the active LimitVersion; canonical v1 seed when the API has not answered yet. */
export function riskLimits(values: readonly LimitValue[] = LIMITS_V1): RiskLimits {
  const seed = (k: LimitValue["key"]) => valueOf(LIMITS_V1, k) as number;
  const pick = (k: LimitValue["key"]) => valueOf(values, k) ?? seed(k);
  return {
    dailyHalt: pick("daily_loss_halt_pct"),
    killDrawdown: pick("kill_drawdown_pct"),
    maxPositions: pick("max_concurrent_positions"),
    targetPositions: pick("target_concurrent_positions"),
    maxPositionPct: pick("max_position_pct"),
  };
}

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
  /** 0…1 for the progress rule. */
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

export function marketValue(p: Pick<Position, "qty" | "last_price">): number {
  return p.qty * p.last_price;
}

export interface Exposure {
  gross: number;
  pct: number;
  largest: { ticker: string; pct: number } | null;
  unrealized: number;
}

/** Gross long exposure and the largest single position, as a share of equity (R07/R08). */
export function exposure(positions: readonly Position[], equity: number): Exposure {
  const gross = positions.reduce((a, p) => a + marketValue(p), 0);
  const top = [...positions].sort((a, b) => marketValue(b) - marketValue(a))[0];
  return {
    gross,
    pct: equity > 0 ? gross / equity : 0,
    largest: top && equity > 0 ? { ticker: top.ticker, pct: marketValue(top) / equity } : null,
    unrealized: positions.reduce((a, p) => a + p.unrealized_pnl, 0),
  };
}

/** Meter fill for a loss against its limit: 0 at 0 %, 1 at the limit, clamped (gains → 0). */
export function lossFraction(value: number, limit: number): number {
  if (limit >= 0 || value >= 0) return 0;
  return Math.min(1, value / limit);
}

export type DeskTone = "normal" | "halt" | "kill";

export function deskTone(r: Pick<RiskStatus, "kill_switch" | "halted_today">): DeskTone {
  if (r.kill_switch === "on") return "kill";
  if (r.halted_today) return "halt";
  return "normal";
}

/**
 * Kill switch control state for the signed-in user. Engage: R or D (no step-up). Reset is
 * four-eyes (09 §5 b, §9 Ç-8): Admin starts (1/2), a Risk Officer who is not the starter
 * confirms (2/2). The daily −1 % halt has no manual release at all.
 */
export type KillControl =
  | { phase: "off"; canEngage: boolean }
  | { phase: "on"; canStartReset: boolean }
  | { phase: "reset_pending"; request: KillResetRequest; canConfirm: boolean; isRequester: boolean; reason: string | null };

export function killControl(r: Pick<RiskStatus, "kill_switch" | "reset_request">, role: Role, uid: string): KillControl {
  if (r.kill_switch === "off") return { phase: "off", canEngage: can(role, "kill_on") };
  const req = r.reset_request;
  if (!req) return { phase: "on", canStartReset: can(role, "kill_reset_init") };
  const isRequester = req.requested_by === uid;
  const allowed = can(role, "kill_reset_confirm");
  const reason = !allowed
    ? "Sıfırlamayı yalnızca Risk Officer onaylar."
    : isRequester
      ? "Sıfırlamayı başlatan kişi onaylayamaz (dört göz)."
      : null;
  return { phase: "reset_pending", request: req, canConfirm: allowed && !isRequester, isRequester, reason };
}

/** Phrases typed to confirm (ConfirmDialog compares in tr-TR upper case). */
export const KILL_PHRASE = "DURDUR";
export const RESET_START_PHRASE = "SIFIRLA";
export const RESET_CONFIRM_PHRASE = "ONAYLA";

/** Who did it, in words, for actor strings like "user:u-risk" / "system:risk_monitor". */
export function actorLabel(actor: string | null): string {
  if (!actor) return "—";
  if (actor.startsWith("system:risk_monitor")) return "Otomatik (risk izleyici)";
  if (actor.startsWith("system:")) return `Sistem (${actor.slice(7)})`;
  if (actor.startsWith("user:")) return accountName(actor.slice(5));
  return actor;
}
