import type { ApprovalCard, ApprovalStatus } from "@/lib/domain";

/**
 * Pure logic behind Bugün and the Öneri page (PERSONAL-SPEC §2.2, FR-24): which proposals are
 * still open, in what order, and when you may decide. Tested without React.
 */

/** Pending cards past their 09:50 deadline read as expired even before the server says so. */
export function effectiveStatus(card: Pick<ApprovalCard, "status" | "expires_at">, nowMs: number | null): ApprovalStatus {
  if (card.status === "pending" && nowMs !== null && Date.parse(card.expires_at) <= nowMs) return "expired";
  return card.status;
}

export const STATUS_LABEL: Readonly<Record<ApprovalStatus, string>> = {
  pending: "Karar bekliyor",
  claimed: "İnceleniyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  expired: "Süresi doldu (09:50)",
  cancelled: "İptal (kill switch)",
};

export function isOpen(status: ApprovalStatus): boolean {
  return status === "pending" || status === "claimed";
}

/** Queue order: open cards first, soonest deadline first; then decided, newest first. */
export function sortQueue(cards: readonly ApprovalCard[], nowMs: number | null): ApprovalCard[] {
  return [...cards].sort((a, b) => {
    const ao = isOpen(effectiveStatus(a, nowMs));
    const bo = isOpen(effectiveStatus(b, nowMs));
    if (ao !== bo) return ao ? -1 : 1;
    if (ao) return Date.parse(a.expires_at) - Date.parse(b.expires_at) || Date.parse(b.created_at) - Date.parse(a.created_at);
    return Date.parse(b.decided_at ?? b.created_at) - Date.parse(a.decided_at ?? a.created_at);
  });
}

/* ── when you may decide ─────────────────────────────────────────────── */
export interface DecideGate {
  /** Any decision (approve or reject) is possible. */
  canDecide: boolean;
  /** Approve specifically (blocked by the daily −1% halt; reject is still allowed). */
  canApprove: boolean;
  /** Why the controls are disabled (shown as a hint; never hide the buttons, PANEL-CONTRACT §3.3). */
  reason: string | null;
  tone: "kill" | "halt" | "closed" | null;
}

export function decideGate(input: { status: ApprovalStatus; killSwitchOn: boolean; haltedToday: boolean }): DecideGate {
  if (input.killSwitchOn) return { canDecide: false, canApprove: false, reason: "Kill switch açık: yeni emir onaylanamaz.", tone: "kill" };
  if (!isOpen(input.status)) return { canDecide: false, canApprove: false, reason: `Bu öneri karara bağlandı: ${STATUS_LABEL[input.status]}.`, tone: "closed" };
  if (input.haltedToday) {
    return { canDecide: true, canApprove: false, reason: "Günlük −%1 durdurması (R02): bugün onay verilemez, yalnızca ret.", tone: "halt" };
  }
  return { canDecide: true, canApprove: true, reason: null, tone: null };
}
