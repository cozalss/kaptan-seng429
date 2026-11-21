import { Benchmark, Karne, MorningBrief, QuietDay, TrackRecord } from "@/lib/domain";
import { MockDb } from "./db";
import { createMockApi } from "./mock-api";
import { stopAllTimers, stopLiveTicker } from "./scenarios";

function setup(fresh = false) {
  const db = new MockDb(null, Date.now(), fresh);
  return { db, api: createMockApi({ db, latencyMs: 0, live: false }) };
}

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
});

describe("mock · reports (the backend's shapes and honesty)", () => {
  it("answers every report in its own schema", async () => {
    const { api } = setup();
    expect(TrackRecord.safeParse(await api.trackRecord()).success).toBe(true);
    expect(Benchmark.safeParse(await api.benchmark()).success).toBe(true);
    expect(Karne.safeParse(await api.karne()).success).toBe(true);
    expect(Karne.safeParse(await api.karne("year")).success).toBe(true);
    expect(QuietDay.safeParse(await api.quietDay()).success).toBe(true);
    expect(MorningBrief.safeParse(await api.briefToday()).success).toBe(true);
  });

  it("never invents an outcome: an open suggestion has no result and says when it will", async () => {
    const { api } = setup();
    const { items, summary } = await api.trackRecord();
    const open = items.filter((i) => i.status === "open");
    expect(open.length).toBeGreaterThan(0);
    for (const i of open) {
      expect(i.return_ratio).toBeNull();
      expect(i.result_tr).toMatch(/^Sonuç .+ belli olur$/);
    }
    expect(summary.done + summary.open + summary.no_data).toBe(summary.count);
  });

  it("says plainly that a handful of results says little", async () => {
    const { api } = setup();
    const { summary } = await api.trackRecord();
    expect(summary.done).toBe(4);
    expect(summary.caveat_tr).toContain("Henüz 4 öneri sonuçlandı; bu kadar azla bir şey söylemek erken.");
    expect(summary.compare_tr).toContain("Her öneriyi izleseydin");
  });

  it("shows no benchmark and no brief before the starting money exists", async () => {
    const { api } = setup(true);
    expect((await api.benchmark()).available).toBe(false);
    expect(await api.briefToday()).toBeNull();
  });

  it("needs a session", async () => {
    const api = createMockApi({ db: new MockDb(null), user: null, latencyMs: 0, live: false });
    await expect(api.karne()).rejects.toMatchObject({ status: 401 });
  });
});

describe("mock · one story for the money of a period", () => {
  it("Karne counts only this month: its own money, the close before it, the sales in it, the open gain Param shows", async () => {
    const { api } = setup();
    const k = await api.karne();
    const book = await api.positions();
    expect(k.put_in_net).toBe(0);
    expect(k.value_start).toBeGreaterThan(0);
    expect(k.gain_try).toBeCloseTo((k.value_end ?? 0) - (k.value_start ?? 0) - k.put_in_net, 2);
    expect(k.realized_try).toBe(116);
    expect(k.commissions_try).toBeGreaterThan(0);
    const open = book.reduce((s, p) => s + p.unrealized_pnl, 0);
    expect(k.unrealized_try).toBeCloseTo(open, 2);
  });

  it("Haftalık shows the week's change, never the opening money as this week's", async () => {
    const { api } = setup();
    const w = await api.weekly();
    expect(w.put_in_net).toBe(0);
    expect(w.value_start).toBeGreaterThan(0);
    expect(w.gain_try).toBeCloseTo((w.value_end ?? 0) - (w.value_start ?? 0), 2);
  });
});
