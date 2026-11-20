import { DAY_BY_ANCHOR, DAY_TOTAL } from "@/mocks/ids";
import type { MockDb } from "./db";
import { approvalCards, counters, explainFor, riskStatus, visibleDisclosures } from "./selectors";

/**
 * Timed behaviour of the mock: the live ticker and fills after approval. Browser-only; every timer is cleared by `stop()`.
 */
const timers = new Set<ReturnType<typeof setTimeout>>();

function later(ms: number, fn: () => void): void {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
}

export function stopAllTimers(): void {
  for (const t of timers) clearTimeout(t);
  timers.clear();
}

function emitCounters(db: MockDb): void {
  db.bus.emit("feed", "counters", counters(db.snapshot));
}

/* ── live ticker: one post-13:40 disclosure every 7–12 s ─────────────── */
let tickerOn = false;

export function startLiveTicker(db: MockDb): void {
  if (tickerOn || typeof window === "undefined") return;
  tickerOn = true;
  const step = () => {
    const released = db.snapshot.releasedLate.length;
    if (DAY_BY_ANCHOR.total + released < DAY_TOTAL) {
      db.update((s) => ({ ...s, releasedLate: [...s.releasedLate, Date.now()] }));
      const newest = visibleDisclosures(db.snapshot).find((d) => d.disclosure_index === DAY_BY_ANCHOR.total + released + 1_651_200);
      if (newest) db.bus.emit("feed", "disclosure", newest);
      emitCounters(db);
    }
    later(7_000 + ((released * 7919) % 5_000), step);
  };
  later(6_000, step);
}

export function stopLiveTicker(): void {
  tickerOn = false;
}

/* ── after approval: the order to enter at the bank ──────────────────── */
/**
 * An approval only issues the order the person enters at their own bank. Nothing is bought or sold
 * here: the book changes when they record the fill they saw (markTicket).
 */
export function executeApproved(db: MockDb, proposalId: string): void {
  const card = approvalCards(db.snapshot).find((a) => a.proposal_id === proposalId);
  if (!card) return;
  const ticket = explainFor(db.snapshot, card.run_id)?.ticket;
  if (!ticket) return;
  db.audit("system:order_ticket", "ticket.issued", "order_ticket", ticket.ticket_no, { ticker: card.ticker, company: card.company_name, qty: ticket.qty, side: card.side, limit_price: ticket.limit_price, stage: ticket.stage }, card.run_id);
  db.bus.emit("desk", "ticket", ticket);
}

/* ── kill switch & loss simulation (06 §11, 11 Adım 4) ───────────────── */
export function engageKillSwitch(db: MockDb, by: string, reason: string): void {
  const open = db.snapshot.orders.filter((o) => o.status === "pending_open" || o.status === "accepted").map((o) => o.id);
  db.update((s) => ({
    ...s,
    risk: { ...s.risk, kill_switch: "on", kill_reason: reason, kill_at: db.nowIso(), kill_by: by, reset_started: null },
    canceledOrderIds: [...new Set([...s.canceledOrderIds, ...open])],
    positionsManagedByExit: true,
  }));
  db.audit(by, "kill_switch.on", "system_flag", "kill_switch", { reason, canceled_orders: open.length });
  db.bus.emit("desk", "kill_switch", riskStatus(db.snapshot));
}
