import type { LimitsView, OrderTicket, RiskStatus } from "@/lib/domain";
import type { Action } from "@/lib/auth/permissions";
import { fmtInt } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { slipsToEnter } from "@/components/tickets/ticket-logic";

/** One thing that waits for the person looking: a plain sentence and where to do it. */
export interface WaitingItem {
  key: "tickets" | "limit" | "reset";
  text: string;
  href: string;
  place: string;
}

export interface WaitingInput {
  can: (action: Action) => boolean;
  /** The person looking (a second signature must come from someone else). */
  uid: string;
  tickets: readonly OrderTicket[] | undefined;
  /** The clock (null until known): a slip past its window is not counted, as on Portföy. */
  now: number | null;
  limits: LimitsView | undefined;
  risk: RiskStatus | null;
}

const sameUid = (a: string, b: string) => a.replace(/^user:/, "") === b.replace(/^user:/, "");

/**
 * "Seni bekleyenler" on Bugün, for the role you look through: slips to enter at the broker,
 * a limit change waiting for your second signature, a restart waiting for your approval.
 * Pure; an empty list means nothing waits (and Bugün shows nothing).
 */
export function waitingItems({ can, uid, tickets, now, limits, risk }: WaitingInput): WaitingItem[] {
  const open = can("ticket.mark") ? slipsToEnter(tickets, now).length : 0;
  const limit = limits?.pending ?? null;
  const reset = risk?.kill_switch === "on" ? (risk.reset?.started ?? null) : null;
  const items: Array<WaitingItem | null> = [
    open > 0
      ? { key: "tickets", text: `${fmtInt(open)} emir fişi aracı kuruma girilmeyi bekliyor`, href: ROUTES.portfoy, place: "Portföy" }
      : null,
    limit && can("limits.decide") && !sameUid(limit.proposed_by.uid, uid)
      ? { key: "limit", text: "Yönetici bir sınır değişikliği önerdi; ikinci imza senin", href: ROUTES.ayarlar, place: "Ayarlar" }
      : null,
    reset && can("kill.reset_confirm") && !sameUid(reset.uid, uid)
      ? { key: "reset", text: "Yeniden başlatma 1/2 imzalı; onay senin", href: ROUTES.portfoy, place: "Portföy" }
      : null,
  ];
  return items.filter((x): x is WaitingItem => x !== null);
}
