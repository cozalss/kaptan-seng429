import { createMockApi, OWNER_ACTOR } from "./mock-api";
import { MockDb, type Actor } from "./db";
import { stopAllTimers, stopLiveTicker } from "./scenarios";
import { isApiError, type KaptanApi } from "../types";
import { PENDING_PROPOSALS } from "@/mocks/ids";
import type { OrderTicket } from "@/lib/domain";

/** A fresh in-memory desk per test; the session can be dropped to test 401s. */
function setup() {
  let current: Actor | null = OWNER_ACTOR;
  const db = new MockDb(null);
  const api: KaptanApi = createMockApi({ getActor: () => current, db, latencyMs: 0, live: false });
  return { db, api, signOut: () => (current = null) };
}

async function errorOf(p: Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await p;
  } catch (e) {
    if (isApiError(e)) return { status: e.status, code: e.code };
    throw e;
  }
  throw new Error("expected the call to fail");
}

const [P1, P2] = PENDING_PROPOSALS;
const approve = (comment = "") => ({ decision: "approve" as const, approved_notional_try: null, comment });

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
});

describe("mock API · session", () => {
  it("rejects calls without a session (401) and names you otherwise", async () => {
    const { api, signOut } = setup();
    expect(await api.me()).toEqual({ id: "sen", display_name: "Sen" });
    signOut();
    expect(await errorOf(api.counters())).toMatchObject({ status: 401 });
  });
});

describe("mock API · proposals", () => {
  it("lists the three seeded pending proposals", async () => {
    const { api } = setup();
    const pending = await api.listApprovals("pending");
    expect(pending.map((c) => c.proposal_id).sort()).toEqual([...PENDING_PROPOSALS].sort());
  });
  it("accepts a decision without a note, records it as yours and writes audit", async () => {
    const { api, db } = setup();
    const before = db.snapshot.auditAppends.length;
    const r = await api.decideApproval(P1, approve());
    expect(r).toMatchObject({ status: "approved", decided_by: "sen", decision_comment: null });
    expect(db.snapshot.auditAppends.slice(before).map((a) => a.actor)).toContain("user:sen");
  });
  it("only shrinks, never grows (Ç-9)", async () => {
    const { api } = setup();
    const card = (await api.listApprovals("pending")).find((c) => c.proposal_id === P1);
    const grow = (card?.final_notional_try ?? 0) + 1;
    expect(await errorOf(api.decideApproval(P1, { decision: "approve", approved_notional_try: grow, comment: "büyüt" }))).toMatchObject({
      status: 422,
      code: "grow_not_allowed",
    });
  });
  it("rejects with a note and refuses a second decision (409)", async () => {
    const { api } = setup();
    const r = await api.decideApproval(P2, { decision: "reject", approved_notional_try: null, comment: "Kanıt zayıf" });
    expect(r).toMatchObject({ status: "rejected", decision_comment: "Kanıt zayıf" });
    expect(await errorOf(api.decideApproval(P2, approve("tekrar")))).toMatchObject({ status: 409 });
  });
  it("404s an unknown proposal and validates the note length", async () => {
    const { api } = setup();
    expect(await errorOf(api.decideApproval("yok", approve()))).toMatchObject({ status: 404 });
    expect(await errorOf(api.decideApproval(P1, approve("x".repeat(501))))).toMatchObject({ status: 422 });
  });
});

describe("mock API · order tickets (emir fişi)", () => {
  async function approvedTicket(api: KaptanApi): Promise<OrderTicket> {
    await api.decideApproval(P1, approve("Kanıt yeterli"));
    const t = (await api.listTickets()).find((x) => x.proposal_id === P1);
    if (!t) throw new Error("no ticket for the approval");
    return t;
  }

  it("issues no ticket before an approval, and one for every approval", async () => {
    const { api } = setup();
    expect((await api.listTickets()).some((x) => x.proposal_id === P1)).toBe(false);
    const t = await approvedTicket(api);
    expect(t.entry.status).toBe("awaiting");
    expect(t.stage).toBe("paper");
    expect(Date.parse(t.valid_until) - Date.parse(t.created_at)).toBeLessThanOrEqual(30 * 60_000);
  });
  it("marks a ticket as entered with the real fill, once", async () => {
    const { api } = setup();
    const t = await approvedTicket(api);
    const at = new Date(Date.parse(t.valid_until) - 60_000).toISOString();
    const r = await api.markTicket(t.ticket_no, { mark: "entered", filled_qty: t.qty, avg_price: t.limit_price, filled_at: at, note: "Tamamı doldu" });
    expect(r.entry).toMatchObject({ status: "entered", filled_qty: t.qty, avg_price: t.limit_price, note: "Tamamı doldu" });
    expect(await errorOf(api.markTicket(t.ticket_no, { mark: "canceled" }))).toMatchObject({ status: 409, code: "already_marked" });
  });
  it("refuses fills that exceed the ticket or arrive after its TTL (R16)", async () => {
    const { api } = setup();
    const t = await approvedTicket(api);
    const inTime = t.approved_at;
    expect(await errorOf(api.markTicket(t.ticket_no, { mark: "entered", filled_qty: t.qty + 1, avg_price: t.limit_price, filled_at: inTime }))).toMatchObject({
      code: "over_qty",
    });
    expect(await errorOf(api.markTicket(t.ticket_no, { mark: "entered", filled_qty: 1, avg_price: t.limit_price + 1, filled_at: inTime }))).toMatchObject({
      code: "over_limit",
    });
    const late = new Date(Date.parse(t.valid_until) + 1_000).toISOString();
    expect(await errorOf(api.markTicket(t.ticket_no, { mark: "entered", filled_qty: 1, avg_price: t.limit_price, filled_at: late }))).toMatchObject({
      status: 422,
      code: "after_ttl",
    });
    expect((await api.markTicket(t.ticket_no, { mark: "unfilled" })).entry.status).toBe("unfilled");
  });
  it("404s an unknown ticket", async () => {
    const { api } = setup();
    expect(await errorOf(api.markTicket("T-YOK", { mark: "canceled" }))).toMatchObject({ status: 404 });
  });
});

describe("mock API · kill switch (personal reset)", () => {
  it("blocks approvals while on; two confirmations ≥ 24 h apart after 5 sessions turn it off", async () => {
    const { api } = setup();
    const on = await api.killSwitch("Test durdurma");
    expect(on.kill_switch).toBe("on");
    expect(on.reset?.next_step).toBe("first");
    expect(await errorOf(api.killSwitch("tekrar açık"))).toMatchObject({ status: 409 });
    expect(await errorOf(api.decideApproval(P1, approve()))).toMatchObject({ status: 409, code: "kill_switch" });

    expect(await errorOf(api.confirmKillReset({ reason: "kısa" }))).toMatchObject({ status: 422 });
    const first = await api.confirmKillReset({ reason: "Olay incelendi: piyasa kaynaklı" });
    expect(first.reset?.next_step).toBe("wait");
    expect(await errorOf(api.confirmKillReset({ reason: "Hemen kapatmak istiyorum" }))).toMatchObject({ status: 409, code: "too_early" });

    const later = await api.advanceDemoClock(200);
    expect(later.demo_clock_offset_h).toBe(200);
    expect(later.reset).toMatchObject({ next_step: "second", sessions_since_kill: 5 });
    const off = await api.confirmKillReset({ reason: "Beş seans geçti, kapatıyorum" });
    expect(off.kill_switch).toBe("off");
    expect(off.drawdown_pct).toBeGreaterThan(-0.05);
  });
  it("refuses a reset when the switch is off and validates the engage reason", async () => {
    const { api } = setup();
    expect(await errorOf(api.confirmKillReset({ reason: "Gereksiz bir sıfırlama" }))).toMatchObject({ status: 409 });
    expect(await errorOf(api.killSwitch("x"))).toMatchObject({ status: 422 });
  });
  it("only fast-forwards by a sane amount", async () => {
    const { api } = setup();
    expect(await errorOf(api.advanceDemoClock(0))).toMatchObject({ status: 422 });
    expect(await errorOf(api.advanceDemoClock(10_000))).toMatchObject({ status: 422 });
  });
});

describe("mock API · audit chain", () => {
  it("records your decisions as yours", async () => {
    const { api, db } = setup();
    await api.decideApproval(P1, approve());
    expect(db.snapshot.auditAppends.some((e) => e.action === "approval.decided" && e.actor === "user:sen")).toBe(true);
  });
});

describe("mock API · demo", () => {
  it("injects a scenario and resets the desk", async () => {
    const { api, db } = setup();
    const r = await api.injectDemo("e3_contract");
    expect(r.run_id).toBeTruthy();
    await api.advanceDemoClock(5);
    await api.resetDemo();
    expect(db.snapshot.injections).toHaveLength(0);
    expect(db.snapshot.clockOffsetH).toBe(0);
  });
});
