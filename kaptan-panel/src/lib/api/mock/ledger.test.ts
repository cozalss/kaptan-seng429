import type { MoneyMovement } from "@/lib/solo/money";
import type { StoredMovement } from "./ledger";
import { cashOf, dayFigures, estimateCommission, flowsOf, hasStarted, initialBook, movementsOf, oldestPrice, ownHeld, ownPositions, putInOf, SEED_START_TRY, type MockBook, type OwnHolding } from "./ledger";

const mv = (kind: MoneyMovement["kind"], amount_try: number, at = "2027-01-11T10:45:00.000Z"): StoredMovement => ({ id: `mv-${kind}-${amount_try}`, kind, amount_try, occurred_at: at, note: "" });

const holding = (over: Partial<OwnHolding> = {}): OwnHolding => ({
  id: "own-1",
  ticker: "FRZBN",
  company_name: "FARAZİ BANKA A.Ş.",
  qty: 100,
  avg_cost: 30,
  bought_on: "2026-12-01",
  added_at: "2027-01-11T10:50:00.000Z",
  price_at_add: 31.24,
  sales: [],
  ...over,
});

describe("the book's two starts", () => {
  it("a seeded book began with 1.000.000 ₺; a fresh one has not begun", () => {
    const seeded = initialBook(false);
    expect(hasStarted(seeded)).toBe(true);
    expect(putInOf(seeded)).toBe(SEED_START_TRY);
    expect(movementsOf(seeded).map((m) => m.kind)).toEqual(["start"]);

    const fresh = initialBook(true);
    expect(hasStarted(fresh)).toBe(false);
    expect(putInOf(fresh)).toBe(0);
    expect(movementsOf(fresh)).toEqual([]);
    expect(hasStarted({ ...fresh, movements: [mv("start", 50_000)] })).toBe(true);
  });
});

describe("money put in", () => {
  it("is start + deposits − withdrawals + the cost of shares added by hand, newest movement first", () => {
    const book: MockBook = {
      seeded: false,
      movements: [mv("start", 50_000, "2027-01-11T10:41:00.000Z"), mv("deposit", 5_000, "2027-01-11T10:42:00.000Z"), mv("withdrawal", 1_250.5, "2027-01-11T10:43:00.000Z"), mv("holding", 3_000, "2027-01-11T10:44:00.000Z")],
      holdings: [holding()],
    };
    expect(putInOf(book)).toBe(56_749.5);
    expect(movementsOf(book).map((m) => m.kind)).toEqual(["holding", "withdrawal", "deposit", "start"]);
  });
});

describe("cash", () => {
  const book: MockBook = { seeded: false, movements: [mv("start", 100_000), mv("deposit", 10_000), mv("withdrawal", 4_000), mv("holding", 3_000)], holdings: [holding()] };

  it("moves with money by hand and never with a share added by hand", () => {
    expect(cashOf(book, 0, [])).toBe(106_000);
  });

  it("a buy takes out the price and the commission; a sale puts back the price less the commission", () => {
    expect(cashOf(book, 0, [{ side: "buy", qty: 100, price: 48.4, commission: 9.68 }])).toBe(106_000 - 4_840 - 9.68);
    expect(cashOf(book, 0, [{ side: "sell", qty: 100, price: 50, commission: 10 }])).toBe(106_000 + 5_000 - 10);
  });

  it("selling a hand-entered share adds its proceeds less the commission", () => {
    const sold: MockBook = { ...book, holdings: [holding({ sales: [{ qty: 40, price: 32, commission: 2.56, at: "2027-01-11T11:00:00.000Z" }] })] };
    expect(cashOf(sold, 0, [])).toBe(106_000 + 1_280 - 2.56);
    expect(ownHeld(sold, "own-1")).toBe(60);
    expect(ownHeld(sold, "yok")).toBe(0);
  });

  it("starts from what the seeded book had", () => {
    expect(cashOf(initialBook(false), 412_000.25, [])).toBe(412_000.25);
  });

  it("estimates a commission at 2 per thousand of the trade, to the kuruş", () => {
    expect(estimateCommission(100, 48.4)).toBe(9.68);
    expect(estimateCommission(3, 33.33)).toBe(0.2);
  });
});

describe("a deposit is not a gain", () => {
  const seed = { seedEquity: 1_018_615, seedDaily: 0.0021, seedPeak: 1_020_000, seedDrawdown: -0.00136 };

  it("leaves the fixture's own figures alone while nothing was touched", () => {
    expect(dayFigures({ ...seed, equity: seed.seedEquity, flows: 0, touched: false })).toEqual({ daily_pnl_pct: 0.0021, peak_equity: 1_020_000, drawdown_pct: -0.00136 });
  });

  it("shifts the day's start and the peak by the flow: the day's lira change stays the same", () => {
    const before = seed.seedEquity - seed.seedEquity / (1 + seed.seedDaily);
    const flows = 100_000;
    const equity = seed.seedEquity + flows;
    const f = dayFigures({ ...seed, equity, flows, touched: true });
    const after = equity - equity / (1 + f.daily_pnl_pct);
    expect(after).toBeCloseTo(before, 0);
    expect(f.peak_equity).toBe(1_120_000);
    // The same 1.385 ₺ below the peak as before the deposit.
    expect(f.peak_equity - equity).toBeCloseTo(seed.seedPeak - seed.seedEquity, 2);
    expect(f.drawdown_pct).toBeLessThan(0);
    expect(f.drawdown_pct).toBeGreaterThan(seed.seedDrawdown);
  });

  it("a withdrawal is not a loss either", () => {
    const flows = -200_000;
    const equity = seed.seedEquity + flows;
    const f = dayFigures({ ...seed, equity, flows, touched: true });
    expect(equity - equity / (1 + f.daily_pnl_pct)).toBeCloseTo(seed.seedEquity - seed.seedEquity / (1 + seed.seedDaily), 0);
    expect(f.daily_pnl_pct).toBeGreaterThan(0);
  });

  it("a commission is a real loss of the day", () => {
    const f = dayFigures({ ...seed, equity: seed.seedEquity - 50, flows: 0, touched: true });
    expect(f.daily_pnl_pct).toBeLessThan(seed.seedDaily);
  });

  it("a fresh book starts its day at the money put in: no gain, no fall", () => {
    expect(dayFigures({ equity: 50_000, seedEquity: 0, seedDaily: 0, seedPeak: 0, seedDrawdown: 0, flows: 50_000, touched: true })).toEqual({ daily_pnl_pct: 0, peak_equity: 50_000, drawdown_pct: 0 });
    expect(dayFigures({ equity: 0, seedEquity: 0, seedDaily: 0, seedPeak: 0, seedDrawdown: 0, flows: 0, touched: true })).toEqual({ daily_pnl_pct: 0, peak_equity: 0, drawdown_pct: 0 });
  });

  it("counts a hand-entered share as a flow at the price it joined with", () => {
    const book: MockBook = { seeded: false, movements: [mv("start", 10_000), mv("holding", 3_000)], holdings: [holding()] };
    expect(flowsOf(book)).toBe(10_000 + 3_124);
  });
});

describe("hand-entered holdings as positions", () => {
  const opts = { nowMs: Date.parse("2027-01-11T10:40:00.000Z"), priceOf: () => 31.24, priceAsOf: "2027-01-11T10:35:00.000Z", managedByExit: false };

  it("stand at their cost, are marked as the person's own and carry no suggestion", () => {
    const [p] = ownPositions({ seeded: false, movements: [], holdings: [holding()] }, opts);
    expect(p).toMatchObject({ id: "own-1", origin: "own", ticker: "FRZBN", qty: 100, avg_cost: 30, last_price: 31.24, source_proposal: "", run_id: "", event_type: "IGNORE", planned_exit_date: "2026-12-01", book: "personal", unrealized_pnl: 124 });
  });

  it("shrink by what was sold and disappear when nothing is left", () => {
    const part = holding({ sales: [{ qty: 40, price: 32, commission: 2, at: "2027-01-11T11:00:00.000Z" }] });
    expect(ownPositions({ seeded: false, movements: [], holdings: [part] }, opts)[0]).toMatchObject({ qty: 60, realized_pnl: 78 });
    const all = holding({ sales: [{ qty: 100, price: 32, commission: 2, at: "2027-01-11T11:00:00.000Z" }] });
    expect(ownPositions({ seeded: false, movements: [], holdings: [all] }, opts)).toEqual([]);
  });
});

describe("oldestPrice", () => {
  it("is the oldest known price time, or null with no holdings", () => {
    expect(oldestPrice([])).toBeNull();
    expect(oldestPrice([{ price_as_of: "2027-01-11T10:35:00.000Z" }, { price_as_of: "2027-01-08T15:10:00.000Z" }, { price_as_of: null }])).toBe("2027-01-08T15:10:00.000Z");
  });
});
