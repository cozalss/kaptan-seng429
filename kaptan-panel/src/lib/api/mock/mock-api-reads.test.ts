import { actorFor, createMockApi } from "./mock-api";
import { MockDb } from "./db";
import { stopAllTimers, stopLiveTicker } from "./scenarios";
import { isApiError, errorMessage, ApiError, type KaptanApi } from "../types";
import { DAY_BY_ANCHOR } from "@/mocks/ids";
import { Explain } from "@/lib/domain";


function setup() {
  const db = new MockDb(null);
  const api: KaptanApi = createMockApi({ getActor: () => actorFor("risk_officer"), db, latencyMs: 0, live: false });
  return { db, api };
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
    const { api } = setup();
    expect((await api.me()).display_name).toBe("Üye 3");
  });

  it("serves explain for a run and 404s an unknown one", async () => {
    const { api } = setup();
    const cards = await api.listApprovals("all");
    const first = cards[0];
    if (!first) throw new Error("no cards");
    const e = await api.explain(first.run_id);
    expect(Explain.safeParse(e).success).toBe(true);
    expect(e.approval?.proposal_id).toBe(first.proposal_id);
    expect(await statusOf(api.explain("run-yok"))).toBe(404);
  });

  it("serves the desk: tickets, positions, P&L, risk, counters", async () => {
    const { api } = setup();
    expect(Array.isArray(await api.listTickets())).toBe(true);
    expect((await api.positions()).length).toBeGreaterThan(0);
    const pnl = await api.pnl("2026-12-01", "2026-12-31");
    expect(pnl.every((p) => p.d >= "2026-12-01" && p.d <= "2026-12-31")).toBe(true);
    expect((await api.riskStatus()).kill_switch).toBe("off");
    expect((await api.listApprovals("all")).length).toBeGreaterThanOrEqual(3);
    expect(await api.counters()).toMatchObject({ total: DAY_BY_ANCHOR.total });
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
