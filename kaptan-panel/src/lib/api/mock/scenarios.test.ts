import { MockDb, type Actor } from "./db";
import { DEMO_RUN_MS } from "./selectors";
import { approvalCards, explainFor, riskStatus } from "./selectors";
import { engageKillSwitch, executeApproved, runDemoScenario, startLiveTicker, stopAllTimers, stopLiveTicker } from "./scenarios";
import { DEMO_E3_PROPOSAL, DEMO_E3_RUN, DEMO_INJ_RUN, DEMO_R04_RUN, PENDING_PROPOSALS } from "@/mocks/ids";
import type { BusMessage, StreamKey } from "@/lib/sse/bus";

const OWNER: Actor = { uid: "uye-1", name: "Üye 1", role: "admin" };

function recorder(db: MockDb, key: StreamKey) {
  const seen: BusMessage[] = [];
  db.bus.subscribe(key, (m) => seen.push(m));
  return seen;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  vi.useRealTimers();
});

describe("demo scenario · E3 contract (11 §2 Adım 1–2)", () => {
  it("streams the run node by node and ends at the approval interrupt", () => {
    const db = new MockDb(null);
    const desk = recorder(db, "desk");
    const run = recorder(db, `run:${DEMO_E3_RUN}`);
    const r = runDemoScenario(db, OWNER, "e3_contract");
    expect(r.run_id).toBe(DEMO_E3_RUN);

    vi.advanceTimersByTime(DEMO_RUN_MS / 2);
    expect(run.some((m) => m.event === "node")).toBe(true);
    expect(desk.some((m) => m.event === "approval.requested")).toBe(false);

    vi.advanceTimersByTime(DEMO_RUN_MS);
    expect(run.map((m) => m.event)).toEqual(expect.arrayContaining(["interrupt", "done"]));
    expect(desk.find((m) => m.event === "approval.requested")).toBeDefined();
    expect(approvalCards(db.snapshot).find((c) => c.proposal_id === DEMO_E3_PROPOSAL)?.status).toBe("pending");
    expect(db.snapshot.auditAppends.some((e) => e.action === "demo.injected")).toBe(true);
  });

  it("fills an approved intraday order at the scripted 48,32 after 1,8 s", () => {
    const db = new MockDb(null);
    runDemoScenario(db, OWNER, "e3_contract");
    vi.advanceTimersByTime(DEMO_RUN_MS + 100);
    db.update((s) => ({
      ...s,
      approvals: { ...s.approvals, [DEMO_E3_PROPOSAL]: { status: "approved", decided_by: "uye-3", decided_role: "risk_officer", decided_at: db.nowIso(), decision_comment: "ok", approved_notional_try: null } },
    }));
    const desk = recorder(db, "desk");
    executeApproved(db, DEMO_E3_PROPOSAL);
    expect(desk.map((m) => m.event)).toContain("order");
    vi.advanceTimersByTime(1_900);
    const fill = desk.find((m) => m.event === "fill");
    expect(fill?.data).toMatchObject({ price: 48.32, qty: 1240 });
  });
});

describe("demo scenario · red-team and R04", () => {
  it("never lets the injection reach the rule engine", () => {
    const db = new MockDb(null);
    runDemoScenario(db, OWNER, "redteam_injection");
    vi.advanceTimersByTime(DEMO_RUN_MS + 100);
    const e = explainFor(db.snapshot, DEMO_INJ_RUN);
    expect(e?.trace.nodes.some((n) => n.node === "rule_engine")).toBe(false);
    expect(e?.approval ?? null).toBeNull();
  });
  it("vetoes the restricted security before any LLM call", () => {
    const db = new MockDb(null);
    runDemoScenario(db, OWNER, "restricted_r04");
    vi.advanceTimersByTime(DEMO_RUN_MS + 100);
    expect(explainFor(db.snapshot, DEMO_R04_RUN)?.run.llm_calls).toBe(0);
  });
});

describe("loss simulation (11 Adım 4)", () => {
  it("halts the day at −%1 and trips the kill switch at −%5 drawdown", () => {
    const db = new MockDb(null);
    const desk = recorder(db, "desk");
    runDemoScenario(db, OWNER, "loss_simulation");
    vi.advanceTimersByTime(1_400 * 3 + 10);
    expect(db.snapshot.risk.halted_today).toBe(true);
    expect(db.snapshot.risk.kill_switch).toBe("off");
    vi.advanceTimersByTime(1_400 * 3 + 10);
    expect(db.snapshot.risk.kill_switch).toBe("on");
    expect(desk.map((m) => m.event)).toEqual(expect.arrayContaining(["halt", "kill_switch"]));
    const status = riskStatus(db.snapshot);
    expect(status.drawdown_pct).toBeLessThanOrEqual(-0.05);
    // One source: equity / peak − 1 is the reported drawdown (no second peak).
    expect(status.equity / status.peak_equity - 1).toBeCloseTo(status.drawdown_pct, 3);
  });
});

describe("kill switch", () => {
  it("cancels open orders and hands positions to the exit rule", () => {
    const db = new MockDb(null);
    const [p] = PENDING_PROPOSALS;
    db.update((s) => ({
      ...s,
      approvals: { ...s.approvals, [p]: { status: "approved", decided_by: "uye-3", decided_role: "risk_officer", decided_at: db.nowIso(), decision_comment: "ok", approved_notional_try: null } },
    }));
    executeApproved(db, p);
    engageKillSwitch(db, "user:sen", "Test");
    expect(db.snapshot.canceledOrderIds.length).toBeGreaterThan(0);
    expect(db.snapshot.positionsManagedByExit).toBe(true);
  });
});

describe("live ticker", () => {
  it("releases post-13:40 disclosures one at a time and ignores a second start", () => {
    const db = new MockDb(null);
    const feed = recorder(db, "feed");
    startLiveTicker(db);
    startLiveTicker(db);
    vi.advanceTimersByTime(6_100);
    expect(db.snapshot.releasedLate).toHaveLength(1);
    expect(feed.map((m) => m.event)).toEqual(["disclosure", "counters"]);
    vi.advanceTimersByTime(30_000);
    expect(db.snapshot.releasedLate.length).toBeGreaterThan(1);
  });
});
