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
