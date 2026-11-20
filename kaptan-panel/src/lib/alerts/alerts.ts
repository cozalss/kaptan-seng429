import type { ApprovalCard, RiskStatus } from "@/lib/domain";
import { HOME, href } from "@/lib/nav";

/**
 * Desktop alerts, the pure part: which of the events the panel already receives is worth a
 * notification, what it says and where a click leads. The text never names a share, a company,
 * an amount or a direction: the same sentences the backend sends to the phone.
 */
export type AlertKind = "suggestion" | "halt" | "stop";

export const ALERT_TITLE = "KAPtan";

export const ALERT_TEXT: Readonly<Record<AlertKind, string>> = {
  suggestion: "Yeni bir önerin var.",
  halt: "Günlük zarar sınırına gelindi, yeni öneri durdu.",
  stop: "KAPtan durduruldu.",
};

export interface DesktopAlert {
  kind: AlertKind;
  body: string;
  /** The screen a click brings forward. */
  path: string;
}

type RiskNow = Pick<RiskStatus, "kill_switch" | "halted_today">;

export type DeskSignal =
  | { event: "approval.requested"; data: Pick<ApprovalCard, "proposal_id"> }
  | { event: "halt" | "kill_switch"; data: RiskNow };

const alertOf = (kind: AlertKind, path: string): DesktopAlert => ({ kind, body: ALERT_TEXT[kind], path });

/**
 * The alert for a desk event, or null. A stop and a daily stop alert once, when they begin:
 * `before` is the risk state the panel knew until now (null = none yet).
 */
export function alertFor(signal: DeskSignal, before: RiskNow | null): DesktopAlert | null {
  if (signal.event === "approval.requested") return alertOf("suggestion", href.proposal(signal.data.proposal_id));
  if (signal.event === "kill_switch") return signal.data.kill_switch === "on" && before?.kill_switch !== "on" ? alertOf("stop", HOME) : null;
  return signal.data.halted_today && !before?.halted_today ? alertOf("halt", HOME) : null;
}

export type AlertPermission = NotificationPermission | "unsupported";

/** Only after the person turned alerts on, with the browser's leave, and never over the app they are looking at. */
export function shouldNotify({ enabled, permission, looking }: { enabled: boolean; permission: AlertPermission; looking: boolean }): boolean {
  return enabled && permission === "granted" && !looking;
}
