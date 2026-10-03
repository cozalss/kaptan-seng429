import type { NodeName, Order } from "@/lib/domain";
import { NODE_LABELS } from "@/lib/domain";
import { DAY_BY_ANCHOR, DAY_TOTAL, DEMO_E3_RUN, type DemoScenario } from "@/mocks/ids";
import { liveEquity } from "@/mocks/pnl";
import { DEMO_E3_SPEC, DEMO_INJ_SPEC, DEMO_R04_SPEC } from "@/mocks/runs-demo";
import type { Actor, MockDb } from "./db";
import { approvalCards, counters, DEMO_RUN_MS, explainFor, riskStatus, visibleDisclosures } from "./selectors";

/**
 * Timed behaviour of the mock: the live ticker, injected demo runs, fills after approval
 * and the loss simulation (11 §2). Browser-only; every timer is cleared by `stop()`.
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

/* ── demo runs ───────────────────────────────────────────────────────── */
const SPEC_OF: Partial<Record<DemoScenario, typeof DEMO_E3_SPEC>> = {
  e3_contract: DEMO_E3_SPEC,
  redteam_injection: DEMO_INJ_SPEC,
  restricted_r04: DEMO_R04_SPEC,
};

export function runDemoScenario(db: MockDb, actor: Actor, scenario: DemoScenario): { disclosure_index: number | null; run_id: string | null } {
  if (scenario === "loss_simulation") {
    runLossSimulation(db, actor);
    return { disclosure_index: null, run_id: null };
  }
  const spec = SPEC_OF[scenario];
  if (!spec) return { disclosure_index: null, run_id: null };
  db.update((s) => ({ ...s, injections: [...s.injections.filter((i) => i.scenario !== scenario), { scenario, atMs: Date.now() }] }));
  db.audit(`user:${actor.uid}`, "demo.injected", "disclosure", String(spec.disclosure_index), { scenario, fixture: true }, spec.run_id);
  const first = visibleDisclosures(db.snapshot).find((d) => d.disclosure_index === spec.disclosure_index);
  if (first) db.bus.emit("feed", "disclosure", first);
  emitCounters(db);

  const nodes = explainFor(db.snapshot, spec.run_id, Date.now() + DEMO_RUN_MS)?.trace.nodes ?? [];
  const slice = DEMO_RUN_MS / Math.max(1, nodes.length);
  nodes.forEach((n, i) => {
    later(i * slice, () => db.bus.emit(`run:${spec.run_id}`, "node", nodeEvent(n.node, "start", db.nowIso())));
    later((i + 1) * slice - 40, () =>
      db.bus.emit(`run:${spec.run_id}`, "node", { ...nodeEvent(n.node, "end", db.nowIso()), latency_ms: n.latency_ms, tokens_in: n.tokens_in, tokens_out: n.tokens_out }),
    );
  });
  later(DEMO_RUN_MS + 50, () => {
    const e = explainFor(db.snapshot, spec.run_id);
    if (!e) return;
    if (e.classifier) db.bus.emit("feed", "classification", { disclosure_index: spec.disclosure_index, event_type: e.classifier.event_type, confidence: e.classifier.confidence });
    if (e.approval) {
      db.bus.emit(`run:${spec.run_id}`, "interrupt", { proposal_id: e.approval.proposal_id });
      db.bus.emit("desk", "approval.requested", e.approval);
    }
    db.bus.emit(`run:${spec.run_id}`, "done", { status: e.run.status, outcome: e.run.outcome });
    emitCounters(db);
  });
  return { disclosure_index: spec.disclosure_index, run_id: spec.run_id };
}

function nodeEvent(node: NodeName, phase: "start" | "end", at: string) {
  return { node, phase, at, latency_ms: null, tokens_in: null, tokens_out: null, label_tr: NODE_LABELS[node].tr };
}

/* ── after approval: SimBIST order and fill ──────────────────────────── */
export function executeApproved(db: MockDb, proposalId: string): void {
  const card = approvalCards(db.snapshot).find((a) => a.proposal_id === proposalId);
  if (!card) return;
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
    side: "buy",
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
    db.audit("system:simbist", "order.filled", "order", id, { qty, price }, card.run_id);
    db.bus.emit("desk", "fill", { ...fill, ticker: card.ticker });
  });
}

/* ── kill switch & loss simulation (06 §11, 11 Adım 4) ───────────────── */
export function engageKillSwitch(db: MockDb, by: string, reason: string): void {
  const open = db.snapshot.orders.filter((o) => o.status === "pending_open" || o.status === "accepted").map((o) => o.id);
  db.update((s) => ({
    ...s,
    risk: { ...s.risk, kill_switch: "on", kill_reason: reason, kill_at: db.nowIso(), kill_by: by, reset_request: null },
    canceledOrderIds: [...new Set([...s.canceledOrderIds, ...open])],
    positionsManagedByExit: true,
  }));
  db.audit(by, "kill_switch.on", "system_flag", "kill_switch", { reason, canceled_orders: open.length });
  db.bus.emit("desk", "kill_switch", riskStatus(db.snapshot));
}

/**
 * Intraday P&L path of the loss simulation; the drawdown is derived from the same equity
 * curve as the P&L chart (liveEquity), so −1% halts at step 3 and the −5% kill fires last.
 */
const LOSS_DAILY: readonly number[] = [-0.004, -0.0075, -0.0112, -0.021, -0.03, -0.0392];

export function runLossSimulation(db: MockDb, actor: Actor): void {
  db.audit(`user:${actor.uid}`, "demo.injected", "scenario", "loss_simulation", { fixture: true });
  LOSS_DAILY.forEach((daily, i) => {
    const step = { daily, dd: liveEquity(daily).drawdown };
    later(1_400 * (i + 1), () => {
      db.update((s) => ({ ...s, risk: { ...s.risk, daily_pnl_pct: step.daily, drawdown_pct: step.dd } }));
      const s = db.snapshot;
      if (step.daily <= -0.01 && !s.risk.halted_today) {
        db.update((x) => ({ ...x, risk: { ...x.risk, halted_today: true } }));
        db.audit("system:risk_monitor", "risk.halted", "system_flag", "halted_today", { daily_pnl_pct: step.daily });
        db.bus.emit("desk", "halt", riskStatus(db.snapshot));
      } else if (step.dd <= -0.05 && s.risk.kill_switch === "off") {
        engageKillSwitch(db, "system:risk_monitor", "Zirveden −%5 düşüş (R01)");
      } else {
        db.bus.emit("desk", "halt", riskStatus(db.snapshot));
      }
    });
  });
}
