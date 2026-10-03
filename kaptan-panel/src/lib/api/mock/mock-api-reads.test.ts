import { createMockApi } from "./mock-api";
import { MockDb, type Actor } from "./db";
import { stopAllTimers, stopLiveTicker } from "./scenarios";
import { isApiError, errorMessage, ApiError, type KaptanApi } from "../types";
import { DEMO_E3_RUN, DAY_BY_ANCHOR, DAY_INDEX_BASE } from "@/mocks/ids";
import { Explain } from "@/lib/domain";

const RISK: Actor = { uid: "u-risk", name: "Zeynep (Risk Officer)", role: "risk_officer" };
const RISK2: Actor = { uid: "u-risk2", name: "Elif (Risk Officer)", role: "risk_officer" };
const ADMIN: Actor = { uid: "u-admin", name: "Burak (Admin)", role: "admin" };
const ANALYST: Actor = { uid: "u-analist", name: "Mert (Analist)", role: "analyst" };

function setup(start: Actor) {
  let current: Actor = start;
  const db = new MockDb(null);
  const api: KaptanApi = createMockApi({ getActor: () => current, db, latencyMs: 0, live: false });
  return { db, api, act: (a: Actor) => (current = a) };
}

async function statusOf(p: Promise<unknown>): Promise<number> {
  try {
    await p;
    return 200;
  } catch (e) {
    if (isApiError(e)) return e.status;
    throw e;
  }
}

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
});

describe("mock API · reads", () => {
  it("returns the signed-in user", async () => {
    const { api } = setup(ANALYST);
    expect(await api.me()).toMatchObject({ id: "u-analist", roles: ["analyst"], email: "analist@kaptan.demo" });
  });

  it("filters the feed by noise, ticker and event code", async () => {
    const { api } = setup(ANALYST);
    const all = await api.listDisclosures({ noise: "all", page_size: 1000 });
    expect(all.total).toBe(DAY_BY_ANCHOR.total);
    const noise = await api.listDisclosures({ noise: "only", page_size: 1000 });
    expect(noise.items.every((d) => d.is_noise)).toBe(true);
    const filtered = await api.listDisclosures({ noise: "all", event_code: "X", page_size: 1000 });
    expect(filtered.items.every((d) => d.classification?.event_type === "FILTER")).toBe(true);
    const page2 = await api.listDisclosures({ noise: "all", page: 2, page_size: 10 });
    expect(page2.items).toHaveLength(10);
    const byTicker = await api.listDisclosures({ noise: "all", ticker: "msle", page_size: 1000 });
    expect(byTicker.items.every((d) => d.stock_codes.includes("MSLE") || d.stock_codes.some((c) => c === "MSLE"))).toBe(true);
  });

  it("returns a disclosure with text and 404s an unknown one", async () => {
    const { api } = setup(ANALYST);
    const d = await api.getDisclosure(DAY_INDEX_BASE + 1);
    expect(d.texts[0]?.lang).toBe("tr");
    expect(await statusOf(api.getDisclosure(1))).toBe(404);
  });

  it("adds a note that appears on the disclosure", async () => {
    const { api } = setup(ANALYST);
    await api.addNote(DAY_INDEX_BASE + 1, "Takip et");
    const d = await api.getDisclosure(DAY_INDEX_BASE + 1);
    expect(d.notes.map((n) => n.body)).toContain("Takip et");
    expect(await statusOf(api.addNote(DAY_INDEX_BASE + 1, "  "))).toBe(422);
  });

  it("serves runs, explain and run summaries", async () => {
    const { api } = setup(ANALYST);
    const runs = await api.listRuns();
    expect(runs.length).toBeGreaterThan(5);
    const first = runs[0];
    if (!first) throw new Error("no runs");
    expect((await api.getRun(first.run_id)).run_id).toBe(first.run_id);
    const e = await api.explain(first.run_id);
    expect(Explain.safeParse(e).success).toBe(true);
    expect(await statusOf(api.explain("run-yok"))).toBe(404);
    expect(await statusOf(api.getRun("run-yok"))).toBe(404);
    expect((await api.listRuns({ status: "completed" })).every((r) => r.status === "completed")).toBe(true);
  });

  it("serves the desk: orders, tickets, positions, P&L, risk", async () => {
    const { api } = setup(RISK);
    expect(Array.isArray(await api.listOrders())).toBe(true);
    expect((await api.listTickets()).length).toBe(1);
    expect((await api.positions()).length).toBeGreaterThan(0);
    const pnl = await api.pnl("2026-12-01", "2026-12-31");
    expect(pnl.every((p) => p.d >= "2026-12-01" && p.d <= "2026-12-31")).toBe(true);
    expect((await api.riskStatus()).kill_switch).toBe("off");
    expect((await api.listApprovals("all")).length).toBeGreaterThanOrEqual(3);
  });

  it("serves eval, brief, audit pages and the governance lists", async () => {
    const { api } = setup(ADMIN);
    expect((await api.evalSummary()).is_sample).toBe(true);
    expect(await api.brief()).toBeDefined();
    const page = await api.audit({ page_size: 20 });
    expect(page.items).toHaveLength(20);
    expect((await api.adminUsers()).length).toBe(5);
    expect((await api.universe()).length).toBeGreaterThan(10);
    expect((await api.restricted()).length).toBe(3);
    expect((await api.liveArm()).armed).toBe(false);
    expect(await api.counters()).toMatchObject({ total: DAY_BY_ANCHOR.total });
  });

  it("forbids the admin screen data to other roles", async () => {
    const { api } = setup(ANALYST);
    expect(await statusOf(api.adminUsers())).toBe(403);
  });
});

describe("mock API · admin governance", () => {
  it("removes a restricted security only after an Admin request and a Risk Officer confirmation", async () => {
    const { api, act } = setup(ADMIN);
    expect(await statusOf(api.addRestricted({ ticker: "x!", kind: "team_insider", source_ref: null }))).toBe(422);
    const entry = await api.addRestricted({ ticker: "ornkx", kind: "team_insider", source_ref: null });
    expect(entry.ticker).toBe("ORNKX");
    act(RISK);
    expect(await statusOf(api.confirmRestrictedRemoval(entry.id))).toBe(409);
    act(ADMIN);
    await api.requestRestrictedRemoval(entry.id);
    expect(await statusOf(api.requestRestrictedRemoval("rs-yok"))).toBe(404);
    act(RISK);
    await api.confirmRestrictedRemoval(entry.id);
    expect((await api.restricted()).some((r) => r.id === entry.id)).toBe(false);
  });

  it("never arms live mode from the UI key alone (three keys)", async () => {
    const { api, act } = setup(RISK);
    expect(await statusOf(api.confirmLive("123456"))).toBe(409);
    act(ADMIN);
    await api.armLive("123456");
    act(RISK);
    const s = await api.confirmLive("123456");
    expect(s.ui_confirmed_by).toBe("u-risk");
    expect(s.armed).toBe(false);
  });

  it("lets a Risk Officer record a manual fill and validates it", async () => {
    const { api, db } = setup(RISK);
    const order = db.snapshot.orders[0] ?? (await api.listOrders())[0];
    if (!order) throw new Error("no orders in fixtures");
    expect(await statusOf(api.manualFill(order.id, { qty: 0, price: 1, filled_at: db.nowIso() }))).toBe(422);
    expect(await statusOf(api.manualFill("ord-yok", { qty: 1, price: 1, filled_at: db.nowIso() }))).toBe(404);
    const filled = await api.manualFill(order.id, { qty: 10, price: 47.5, filled_at: db.nowIso() });
    expect(filled.status).toBe("filled");
  });

  it("injects the demo, then resets everything (Admin only)", async () => {
    const { api, act } = setup(ADMIN);
    const r = await api.injectDemo("e3_contract");
    expect(r.run_id).toBe(DEMO_E3_RUN);
    act(RISK2);
    expect(await statusOf(api.resetDemo())).toBe(403);
    act(ADMIN);
    await api.resetDemo();
    stopAllTimers();
    stopLiveTicker();
    expect((await api.restricted()).length).toBe(3);
  });

  it("rejects a limits decision on a version that is not pending", async () => {
    const { api } = setup(ADMIN);
    expect(await statusOf(api.decideLimits(1, { decision: "approve", comment: "ok" }))).toBe(409);
  });
});

describe("ApiError helpers", () => {
  it("formats Turkish messages and falls back safely", () => {
    expect(errorMessage(new ApiError(409, "conflict", "Çakışma"))).toBe("Çakışma");
    expect(errorMessage(new Error("x"))).toMatch(/.+/);
    expect(errorMessage("tuhaf")).toMatch(/.+/);
    expect(isApiError({})).toBe(false);
  });
});
