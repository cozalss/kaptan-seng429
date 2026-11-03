import type { Order } from "@/lib/domain";
import { DAY_BY_ANCHOR, DAY_TOTAL, DEMO_E3_RUN } from "@/mocks/ids";
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

/* ── after approval: SimBIST paper order + fill, and your order ticket ─ */
export function executeApproved(db: MockDb, proposalId: string): void {
  const card = approvalCards(db.snapshot).find((a) => a.proposal_id === proposalId);
  if (!card) return;
  const ticket = explainFor(db.snapshot, card.run_id)?.ticket;
  if (ticket) {
    db.audit("system:order_ticket", "ticket.issued", "order_ticket", ticket.ticket_no, { ticker: card.ticker, company: card.company_name, qty: ticket.qty, side: card.side, limit_price: ticket.limit_price, stage: ticket.stage }, card.run_id);
    db.bus.emit("desk", "ticket", ticket);
  }
  const id = card.run_id.replace(/^run-/, "ord-s-");
  const isOpenAuction = card.entry === "next_open_auction";
  const qty = card.approved_notional_try ? Math.max(1, Math.floor(card.approved_notional_try / card.limit_price)) : card.qty;
  const order: Order = {
    id,
    client_order_id: `kaptan-${id}`,
    proposal_id: proposalId,
    run_id: card.run_id,
    ticker: card.ticker,
    company_name: card.company_name,
    side: card.side,
    order_type: "limit",
    tif: isOpenAuction ? "opg" : "day",
    qty,
    limit_price: card.limit_price,
    status: isOpenAuction ? "pending_open" : "accepted",
    broker: "simbist",
    created_at: db.nowIso(),
    fills: [],
    is_fixture: card.is_fixture,
  };
  db.update((s) => ({ ...s, orders: [...s.orders.filter((o) => o.id !== id), order] }));
  db.bus.emit("desk", "order", order);
  if (isOpenAuction) return;
  later(1_800, () => {
    const price = card.run_id === DEMO_E3_RUN ? 48.32 : Math.round(card.limit_price * 0.995 * 100) / 100;
    const notional = price * qty;
    const commission = Math.round(notional * 0.0005 * 100) / 100;
    const fill = {
      id: id.replace(/^ord-/, "fill-"),
      order_id: id,
      qty,
      price,
      commission,
      bsmv: Math.round(commission * 0.05 * 100) / 100,
      slippage_bps: 6,
      filled_at: db.nowIso(),
      source: "simbist" as const,
    };
    db.update((s) => ({ ...s, orders: s.orders.map((o) => (o.id === id ? { ...o, status: "filled", fills: [fill] } : o)) }));
    db.audit("system:simbist", "order.filled", "order", id, { ticker: card.ticker, company: card.company_name, qty, price }, card.run_id);
    db.bus.emit("desk", "fill", { ...fill, ticker: card.ticker });
  });
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
