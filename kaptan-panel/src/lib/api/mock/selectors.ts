import type {
  ApprovalCard,
  AuditEntry,
  DayCounters,
  DisclosureListItem,
  Explain,
  Order,
  OrderTicket,
  Position,
  RiskStatus,
  RunSummary,
  TraceNode,
} from "@/lib/domain";
import { appendToChain } from "@/lib/audit-chain";
import { addDays, nextTradingDay } from "@/lib/time";
import { baseAuditChain, tamperedChain } from "@/mocks/audit";
import { CLOCK_ANCHOR_MS, DEMO_DAY, mockNowMs } from "@/mocks/clock";
import { dayDisclosures } from "@/mocks/day";
import { buildExplain, disclosureOf } from "@/mocks/explain-builder";
import { liveEquity } from "@/mocks/pnl";
import { DEMO_ORDER_TICKET } from "@/mocks/governance";
import { AUDIT_TAMPER_POS, DAY_BY_ANCHOR, DEMO_E3_RUN, type DemoScenario } from "@/mocks/ids";
import { CURRENT_STAGE } from "@/mocks/personal";
import { buildTicket, effectiveEntry } from "@/mocks/tickets";
import { issuer } from "@/mocks/issuers";
import { DAY_SPECS, HISTORY_SPECS } from "@/mocks/runs-day";
import { DEMO_E3_SPEC, DEMO_INJ_SPEC, DEMO_R04_SPEC } from "@/mocks/runs-demo";
import type { RunSpec } from "@/mocks/run-spec";
import type { MockState } from "./state";

/** A demo run takes this long (real time) from injection to the approval card. */
export const DEMO_RUN_MS = 7_500;

const SCENARIO_SPEC: Partial<Record<DemoScenario, RunSpec>> = {
  e3_contract: DEMO_E3_SPEC,
  redteam_injection: DEMO_INJ_SPEC,
  restricted_r04: DEMO_R04_SPEC,
};

export function nowMs(state: MockState, realNow: number = Date.now()): number {
  return mockNowMs(realNow, state.startedAtReal);
}

/** Injected specs, re-timed to the moment they were injected. */
export function injectedSpecs(state: MockState): RunSpec[] {
  return state.injections.flatMap((inj) => {
    const spec = SCENARIO_SPEC[inj.scenario];
    if (!spec) return [];
    return [{ ...spec, publishedAtIso: new Date(mockNowMs(inj.atMs, state.startedAtReal)).toISOString() }];
  });
}

export function allSpecs(state: MockState): RunSpec[] {
  return [...DAY_SPECS, ...HISTORY_SPECS, ...injectedSpecs(state)];
}

export function specById(state: MockState, runId: string): RunSpec | undefined {
  return allSpecs(state).find((s) => s.run_id === runId);
}

function injectionFor(state: MockState, runId: string) {
  const scenario = (Object.keys(SCENARIO_SPEC) as DemoScenario[]).find((k) => SCENARIO_SPEC[k]?.run_id === runId);
  return scenario ? state.injections.find((i) => i.scenario === scenario) : undefined;
}

/** 0…1 progress of an injected run (1 for everything else). */
export function runProgress(state: MockState, runId: string, realNow: number = Date.now()): number {
  const inj = injectionFor(state, runId);
  if (!inj) return 1;
  return Math.min(1, Math.max(0, (realNow - inj.atMs) / DEMO_RUN_MS));
}

/* ── disclosures ─────────────────────────────────────────────────────── */
export function visibleDisclosures(state: MockState, realNow: number = Date.now()): DisclosureListItem[] {
  const rows = dayDisclosures();
  const pre = rows.slice(0, DAY_BY_ANCHOR.total);
  const late = state.releasedLate.flatMap((atReal, i) => {
    const row = rows[DAY_BY_ANCHOR.total + i];
    if (!row) return [];
    const published = new Date(mockNowMs(atReal, state.startedAtReal)).toISOString();
    return [{ ...row, published_at: published, first_seen_at: published, available_at: published }];
  });
  const injected = injectedSpecs(state).map((s) => {
    const d = disclosureOf(s);
    const done = runProgress(state, s.run_id, realNow) >= 1;
    return done || s.kind === "pregate_veto" ? d : { ...d, classification: null };
  });
  const noteCounts = new Map<number, number>();
  for (const n of state.notes) noteCounts.set(n.disclosure_index, (noteCounts.get(n.disclosure_index) ?? 0) + 1);
  return [...pre, ...late, ...injected]
    .map((d) => ({ ...d, note_count: d.note_count + (noteCounts.get(d.disclosure_index) ?? 0) }))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
}

export function counters(state: MockState, realNow: number = Date.now()): DayCounters {
  const rows = visibleDisclosures(state, realNow);
  const noise = rows.filter((r) => r.is_noise).length;
  const processed = rows.filter((r) => r.run_id !== null).length;
  const approvals = approvalCards(state, realNow);
  const tokens = allSpecs(state)
    .filter((s) => !s.run_id.startsWith("run-hist"))
    .reduce((acc, s) => acc + s.tokens[0] + s.tokens[1], 0);
  return {
    as_of: new Date(nowMs(state, realNow)).toISOString(),
    total: rows.length,
    noise,
    archived: rows.length - noise - processed,
    processed,
    e_candidates: rows.filter((r) => r.classification && ["E1", "E2", "E3", "E4"].includes(r.classification.event_type)).length,
    proposals: approvals.filter((a) => !a.run_id.startsWith("run-hist")).length,
    approvals: approvals.filter((a) => a.status === "approved" && !a.run_id.startsWith("run-hist")).length,
    rejections: approvals.filter((a) => a.status === "rejected").length,
    llm_calls: 31 + injectedSpecs(state).reduce((a, s) => a + s.llmCalls, 0),
    llm_tokens: Math.max(tokens, 412_000),
  };
}

/* ── runs & explain ──────────────────────────────────────────────────── */
const explainCache = new Map<string, Explain>();

function baseExplain(spec: RunSpec): Explain {
  const key = `${spec.run_id}@${spec.publishedAtIso}`;
  let e = explainCache.get(key);
  if (!e) {
    e = buildExplain(spec);
    explainCache.set(key, e);
  }
  return e;
}

function progressTrace(nodes: TraceNode[], progress: number): TraceNode[] {
  if (progress >= 1) return nodes;
  const cut = Math.floor(nodes.length * progress);
  return nodes.map((n, i) => (i < cut ? n : i === cut ? { ...n, status: "running", latency_ms: null } : { ...n, status: "waiting", latency_ms: null, started_at: null }));
}

function patchApproval(state: MockState, a: ApprovalCard, realNow: number): ApprovalCard {
  const patch = state.approvals[a.proposal_id];
  const merged = patch ? { ...a, ...patch } : a;
  if (merged.status === "pending" && state.risk.kill_switch === "on") return { ...merged, status: "cancelled" };
  if (merged.status === "pending" && Date.parse(merged.expires_at) <= nowMs(state, realNow)) return { ...merged, status: "expired" };
  return merged;
}

export function explainFor(state: MockState, runId: string, realNow: number = Date.now()): Explain | undefined {
  const spec = specById(state, runId);
  if (!spec) return undefined;
  const base = baseExplain(spec);
  const progress = runProgress(state, runId, realNow);
  const approval = base.approval && progress >= 1 ? patchApproval(state, base.approval, realNow) : null;
  const isRunning = progress < 1;
  const ticket = approval ? ticketFor(state, spec, base, approval, realNow) : null;
  // Session orders (approvals) replace fixture orders with the same id; the ticket's own order follows.
  const sessionOrders = state.orders.filter((o) => o.run_id === runId).map((o) => applyCancel(state, o));
  const sessionIds = new Set(sessionOrders.map((o) => o.id));
  const fixtureOrders = base.orders.filter((o) => !sessionIds.has(o.id));
  const ticketOrders = ticket ? [ticketOrder(ticket, approval?.decided_at ?? null)] : [];
  // Paper (SimBIST) orders first; the personal-mode ticket order follows.
  const orders = [...fixtureOrders, ...sessionOrders, ...ticketOrders].sort((a, b) => Number(a.broker !== "simbist") - Number(b.broker !== "simbist"));
  return {
    ...base,
    run: {
      ...base.run,
      status: isRunning ? "running" : approval?.status === "approved" ? "completed" : base.run.status,
      finished_at: isRunning ? null : base.run.finished_at,
    },
    disclosure: { ...base.disclosure, classification: isRunning && spec.kind !== "pregate_veto" ? null : base.disclosure.classification },
    approval,
    proposal: isRunning ? null : base.proposal,
    orders,
    fills: orders.flatMap((o) => o.fills),
    ticket,
    audit_positions: auditPositionsFor(state, runId),
    trace: { ...base.trace, nodes: progressTrace(base.trace.nodes, progress) },
  };
}

const istDay = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * Personal mode (12 §2): every proposal you approve on or after the demo day also yields an
 * order ticket you enter by hand at your own broker. The demo E3 run keeps the canonical
 * ticket (T-2027-0111-003); the others are built from their card. Your mark (girildi /
 * dolmadı / iptal) lives in `ticketMarks`; an unmarked ticket past its TTL reads as expired.
 */
function ticketFor(state: MockState, spec: RunSpec, base: Explain, approval: ApprovalCard, realNow: number): OrderTicket | null {
  if (approval.status !== "approved" || !approval.decided_at || istDay(approval.decided_at) < DEMO_DAY) return null;
  const raw =
    spec.run_id === DEMO_E3_RUN
      ? DEMO_ORDER_TICKET
      : buildTicket(approval, base, { seq: 10 + allSpecs(state).findIndex((s) => s.run_id === spec.run_id), decidedAt: approval.decided_at, stage: CURRENT_STAGE });
  return { ...raw, entry: effectiveEntry(raw, state.ticketMarks[raw.ticket_no], nowMs(state, realNow)) };
}

/** The ticket's own order (broker `order_ticket`): waits for your mark, then mirrors it. */
function ticketOrder(t: OrderTicket, decidedAt: string | null): Order {
  const created = decidedAt ? new Date(Date.parse(decidedAt) + 20_000).toISOString() : t.created_at;
  const e = t.entry;
  const base: Order = {
    id: t.order_id,
    client_order_id: `fis-${t.ticket_no}`,
    proposal_id: t.proposal_id,
    run_id: t.run_id,
    ticker: t.ticker,
    company_name: t.company_name,
    side: t.side,
    order_type: "limit",
    tif: "day",
    qty: t.qty,
    limit_price: t.limit_price,
    status: "awaiting_manual_entry",
    broker: "order_ticket",
    created_at: created,
    fills: [],
    is_fixture: t.is_fixture,
  };
  if (e.status === "entered" && e.filled_qty && e.avg_price && e.filled_at) {
    const fill = { id: `fill-${t.ticket_no}`, order_id: t.order_id, qty: e.filled_qty, price: e.avg_price, commission: 0, bsmv: 0, slippage_bps: 0, filled_at: e.filled_at, source: "manual" as const };
    return { ...base, status: e.filled_qty < t.qty ? "partially_filled" : "filled", fills: [fill] };
  }
  if (e.status === "unfilled") return { ...base, status: "canceled", cancel_reason: "ticket_unfilled" };
  if (e.status === "canceled") return { ...base, status: "canceled", cancel_reason: "ticket_canceled" };
  if (e.status === "expired") return { ...base, status: "canceled", cancel_reason: "ticket_expired" };
  return base;
}

/** Every ticket issued so far (one per approval on or after the demo day), newest first. */
export function allTickets(state: MockState, realNow: number = Date.now()): OrderTicket[] {
  return allSpecs(state)
    .map((s) => explainFor(state, s.run_id, realNow)?.ticket)
    .filter((t): t is OrderTicket => Boolean(t))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}


export function runSummaries(state: MockState, realNow: number = Date.now()): RunSummary[] {
  return allSpecs(state)
    .map((s) => explainFor(state, s.run_id, realNow)?.run)
    .filter((r): r is RunSummary => Boolean(r))
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

/* ── approvals, orders, positions ────────────────────────────────────── */
export function approvalCards(state: MockState, realNow: number = Date.now()): ApprovalCard[] {
  return allSpecs(state)
    .filter((s) => s.kind === "propose")
    .map((s) => explainFor(state, s.run_id, realNow)?.approval)
    .filter((a): a is ApprovalCard => Boolean(a))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

function applyCancel(state: MockState, o: Order): Order {
  return state.canceledOrderIds.includes(o.id) && o.status !== "filled" && o.status !== "canceled"
    ? { ...o, status: "canceled", cancel_reason: "kill_switch" }
    : o;
}

export function allOrders(state: MockState, realNow: number = Date.now()): Order[] {
  return allSpecs(state)
    .flatMap((s) => explainFor(state, s.run_id, realNow)?.orders ?? [])
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function positions(state: MockState, realNow: number = Date.now()): Position[] {
  const out: Position[] = [];
  for (const s of allSpecs(state)) {
    const e = explainFor(state, s.run_id, realNow);
    const fill = e?.fills[0];
    if (!e?.proposal || !fill || !s.event) continue;
    const iss = issuer(s.ticker);
    const opened = fill.filled_at;
    let exit = opened.slice(0, 10);
    for (let i = 0; i < e.proposal.holding_days_min; i += 1) exit = nextTradingDay(exit);
    const holdingDays = Math.max(0, Math.round((nowMs(state, realNow) - Date.parse(opened)) / 86_400_000));
    const last = s.run_id === DEMO_E3_RUN ? 48.51 : iss.price * (1 + ((s.disclosure_index % 7) - 2) / 100);
    out.push({
      ticker: s.ticker,
      company_name: iss.name,
      qty: fill.qty,
      avg_cost: fill.price,
      last_price: Math.round(last * 100) / 100,
      opened_at: opened,
      planned_exit_date: exit,
      holding_days: holdingDays,
      source_proposal: e.proposal.proposal_id,
      run_id: s.run_id,
      event_type: s.event,
      strategy_version: s.strategy_version,
      unrealized_pnl: Math.round((last - fill.price) * fill.qty),
      realized_pnl: 0,
      managed_by_exit_rule: state.positionsManagedByExit,
      book: "paper",
    });
  }
  return [...out, ...personalPositions(state, realNow)].sort((a, b) => Date.parse(b.opened_at) - Date.parse(a.opened_at));
}

/** Positions you opened yourself: tickets marked "girildi" with the fill you saw at your broker. */
function personalPositions(state: MockState, realNow: number): Position[] {
  return allTickets(state, realNow).flatMap((t): Position[] => {
    const e = t.entry;
    const spec = specById(state, t.run_id);
    if (e.status !== "entered" || !e.filled_qty || !e.avg_price || !e.filled_at || !spec?.event) return [];
    const last = issuer(t.ticker).price;
    let exit = e.filled_at.slice(0, 10);
    for (let i = 0; i < 5; i += 1) exit = nextTradingDay(exit);
    return [
      {
        ticker: t.ticker,
        company_name: t.company_name,
        qty: e.filled_qty,
        avg_cost: e.avg_price,
        last_price: last,
        opened_at: e.filled_at,
        planned_exit_date: exit,
        holding_days: Math.max(0, Math.round((nowMs(state, realNow) - Date.parse(e.filled_at)) / 86_400_000)),
        source_proposal: t.proposal_id,
        run_id: t.run_id,
        event_type: spec.event,
        strategy_version: spec.strategy_version,
        unrealized_pnl: Math.round((last - e.avg_price) * e.filled_qty),
        realized_pnl: 0,
        managed_by_exit_rule: state.positionsManagedByExit,
        book: "personal",
      },
    ];
  });
}

/* ── risk ────────────────────────────────────────────────────────────── */
export function riskStatus(state: MockState, realNow: number = Date.now()): RiskStatus {
  const r = state.risk;
  const live = liveEquity(r.daily_pnl_pct);
  const { equity } = live;
  const drawdown = Math.min(0, r.drawdown_pct);
  return {
    kill_switch: r.kill_switch,
    kill_reason: r.kill_reason,
    kill_at: r.kill_at,
    kill_by: r.kill_by,
    halted_today: r.halted_today,
    daily_pnl_pct: r.daily_pnl_pct,
    drawdown_pct: drawdown,
    // The fixture's running peak; only a post-reset override (drawdown floor) re-derives it.
    peak_equity: drawdown === live.drawdown ? live.peak : Math.round(equity / (1 + drawdown)),
    equity,
    regime: "normal",
    live_armed: state.liveArm.armed,
    quota: [
      { provider: "Gemini Flash-Lite", used: 118 + injectedSpecs(state).length * 4, limit: 500 },
      { provider: "Groq gpt-oss", used: 61 + injectedSpecs(state).length * 2, limit: 1_000 },
      { provider: "Prompt Guard 2", used: 140 + injectedSpecs(state).length, limit: 14_400 },
    ],
    reset: r.kill_switch === "on" ? { started: r.reset_started } : null,
    as_of: new Date(nowMs(state, realNow)).toISOString(),
  };
}

/* ── audit ───────────────────────────────────────────────────────────── */
/** The whole chain; with the tamper test on, record #3.907's payload was changed behind its back. */
export function auditChain(state: MockState): AuditEntry[] {
  const chain = state.auditAppends.length ? appendToChain(baseAuditChain(), state.auditAppends) : [...baseAuditChain()];
  return state.tamperOn ? tamperedChain(chain, AUDIT_TAMPER_POS) : chain;
}

function auditPositionsFor(state: MockState, runId: string): Explain["audit_positions"] {
  return auditChain(state)
    .filter((e) => e.run_id === runId)
    .slice(-8)
    .map((e) => ({ chain_pos: e.chain_pos, action: e.action, hash: e.hash }));
}

/** Positions whose planned exit date is today (brief). */
export function expiringToday(state: MockState, realNow: number = Date.now()): Position[] {
  const today = new Date(nowMs(state, realNow) + 3 * 3_600_000).toISOString().slice(0, 10);
  return positions(state, realNow).filter((p) => p.planned_exit_date <= today);
}

export const ANCHOR_DATE = new Date(CLOCK_ANCHOR_MS).toISOString().slice(0, 10);
export const PREV_SESSION = addDays(ANCHOR_DATE, -3);
