import { createMockApi } from "./mock-api";
import { MockDb } from "./db";
import { isApiError } from "../types";

const TODAY = "2027-01-11";

function setup(fresh: boolean) {
  const db = new MockDb(null, Date.now(), fresh);
  return { db, api: createMockApi({ db, latencyMs: 0, live: false }) };
}

async function errorOf(p: Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await p;
  } catch (e) {
    if (isApiError(e)) return { status: e.status, code: e.code };
    throw e;
  }
  throw new Error("expected an error");
}

async function withKrgcl() {
  const s = setup(true);
  await s.api.moveMoney({ kind: "start", amount_try: 50_000 });
  await s.api.addHolding({ ticker: "KRGCL", qty: 100, avg_cost: 30, bought_on: "2027-01-04" });
  return s;
}

describe("allocation", () => {
  it("shares the whole money, cash included, and warns over the person's limit", async () => {
    const { api } = await withKrgcl();
    const a = await api.insightsAllocation();
    const top = a.holdings[0];
    expect(top?.ticker).toBe("KRGCL");
    expect(Math.round(a.cash_pct + (top?.pct ?? 0))).toBe(100);
    const tight = await api.setConcentration(5);
    expect(tight.warning_tr).toMatch(/^Paranın %[\d,]+'i tek hissede \(KRGCL\)\. Sınırın %5\.$/);
    expect((await api.setConcentration(100)).warning_tr).toBeNull();
  });

  it("writes the limit to the audit trail and refuses values outside 5..100", async () => {
    const { api, db } = await withKrgcl();
    await api.setConcentration(40);
    expect(db.snapshot.auditAppends.at(-1)?.action).toBe("concentration.threshold_set");
    expect(await errorOf(api.setConcentration(4))).toMatchObject({ status: 422 });
    expect(await errorOf(api.setConcentration(101))).toMatchObject({ status: 422 });
  });

  it("says nothing before the starting money", async () => {
    const { api } = setup(true);
    const a = await api.insightsAllocation();
    expect(a.started).toBe(false);
    expect(a.holdings).toEqual([]);
  });
});

describe("closed trades", () => {
  it("counts a hand holding's sale after commission, with unknown days held", async () => {
    const { api } = await withKrgcl();
    expect((await api.closedTrades()).trades).toEqual([]);
    await api.sellHolding(await handId(api), { qty: 40, price: 33, sold_at: `${TODAY}T10:00:00.000Z`, commission_try: 4 });
    const out = await api.closedTrades();
    expect(out.trades[0]).toMatchObject({ ticker: "KRGCL", qty: 40, cost_try: 1200, proceeds_try: 1316, gain_try: 116, days_held: null });
    expect(out.win_rate_pct).toBe(100);
    expect(out.avg_days_held).toBeNull();
    expect(out.note_tr).toContain("alış günü bilinmediği");
  });
});

async function handId(api: ReturnType<typeof createMockApi>): Promise<string> {
  const pos = await api.positions();
  return pos.find((p) => p.ticker === "KRGCL")?.id ?? "";
}

describe("return stats and the comparison", () => {
  it("need two closes; a fresh book has none and says so", async () => {
    const { api } = setup(true);
    const s = await api.returnStats();
    expect(s.available).toBe(false);
    expect(s.reason_tr).toContain("iki borsa günü");
    expect((await api.versusMoney()).items).toEqual([]);
  });

  it("chain the flow-free daily returns of the seeded book and hide what has no official source", async () => {
    const { api } = setup(false);
    const s = await api.returnStats();
    expect(s.available).toBe(true);
    expect(s.days).toBeGreaterThanOrEqual(2);
    expect(s.max_fall_pct).toBeLessThanOrEqual(0);
    const v = await api.versusMoney();
    expect(v.items.map((i) => [i.key, i.pct === null])).toEqual([["you", false], ["usd", true], ["inflation", true], ["deposit", true]]);
    expect(v.items.find((i) => i.key === "inflation")?.hidden_reason_tr).toContain("tahmin yazmıyorum");
  });
});

describe("dividend income", () => {
  it("counts only recorded dividends, by month and per holding with the yield on cost", async () => {
    const { api } = await withKrgcl();
    expect((await api.dividendIncome()).total_try).toBe(0);
    await api.recordDividend({ ticker: "KRGCL", net_try: 150, received_on: TODAY });
    const d = await api.dividendIncome();
    expect(d.this_year_try).toBe(150);
    expect(d.months).toHaveLength(12);
    expect(d.months.at(-1)).toEqual({ month: "2027-01", total_try: 150 });
    expect(d.holdings[0]).toMatchObject({ ticker: "KRGCL", last12_try: 150, cost_try: 3000, yield_on_cost_pct: 5 });
  });
});

describe("notes", () => {
  it("are saved, replaced, cleared and audited; the text never goes into the audit", async () => {
    const { api, db } = await withKrgcl();
    const saved = await api.saveHoldingNote("KRGCL", "  Temettü için aldım.  ");
    expect(saved.notes[0]).toMatchObject({ ticker: "KRGCL", body: "Temettü için aldım." });
    const audit = db.snapshot.auditAppends.at(-1);
    expect(audit?.action).toBe("note.saved");
    expect(JSON.stringify(audit)).not.toContain("Temettü");
    expect((await api.saveHoldingNote("KRGCL", "Yüzde 30 olunca satarım.")).notes).toHaveLength(1);
    expect((await api.clearHoldingNote("KRGCL")).notes).toEqual([]);
    expect(await errorOf(api.clearHoldingNote("KRGCL"))).toEqual({ status: 404, code: "no_note" });
  });

  it("need 3 to 500 characters and a share that is in the book", async () => {
    const { api } = await withKrgcl();
    expect(await errorOf(api.saveHoldingNote("KRGCL", "ab"))).toMatchObject({ status: 422 });
    expect(await errorOf(api.saveHoldingNote("KRGCL", "x".repeat(501)))).toMatchObject({ status: 422 });
    expect(await errorOf(api.saveHoldingNote("THYAO", "Hiç almadım."))).toEqual({ status: 404, code: "not_in_book" });
  });
});
