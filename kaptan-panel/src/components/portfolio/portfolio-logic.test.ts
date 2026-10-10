import type { PnlPoint, Position } from "@/lib/domain";
import { holdingProgress, istanbulDate, positionReturn, sessionsBetween } from "./risk-math";
import { exitLine } from "./holdings";
import { equitySeries, linePath } from "./equity-line";

const pos = (over: Partial<Position> = {}): Position => ({
  ticker: "ORNEK",
  company_name: "ÖRNEK ENERJİ A.Ş.",
  qty: 100,
  avg_cost: 40,
  last_price: 44,
  opened_at: "2027-01-04T06:55:00.000Z",
  planned_exit_date: "2027-02-01",
  holding_days: 7,
  source_proposal: "p1",
  run_id: "r1",
  event_type: "E3",
  strategy_version: "v1.1-fwd",
  unrealized_pnl: 400,
  realized_pnl: 0,
  managed_by_exit_rule: false,
  book: "paper",
  ...over,
});

describe("calendar", () => {
  it("gives the Istanbul date of an instant (UTC+3)", () => {
    expect(istanbulDate(Date.parse("2027-01-10T21:30:00Z"))).toBe("2027-01-11");
    expect(istanbulDate(Date.parse("2027-01-11T10:40:00Z"))).toBe("2027-01-11");
  });
  it("counts sessions after the start day, skipping weekends and holidays", () => {
    expect(sessionsBetween("2027-01-04", "2027-01-11")).toBe(5);
    expect(sessionsBetween("2026-12-31", "2027-01-04")).toBe(1);
    expect(sessionsBetween("2027-01-12", "2027-01-11")).toBe(0);
  });
});

describe("holdings", () => {
  it("measures sessions held against the plan", () => {
    const h = holdingProgress(pos(), "2027-01-11");
    expect(h).toMatchObject({ elapsed: 5, planned: 20, dueToday: false, overdue: false });
    expect(h.fraction).toBeCloseTo(0.25);
    expect(holdingProgress(pos({ opened_at: "2027-01-11T06:55:00Z", planned_exit_date: "2027-01-11" }), "2027-01-11").planned).toBe(1);
  });
  it("says how long is left in words", () => {
    expect(exitLine(pos(), "2027-01-11")).toBe("15 gün kaldı");
    expect(exitLine(pos({ planned_exit_date: "2027-01-11" }), "2027-01-11")).toBe("bugün çıkılır");
    expect(exitLine(pos({ planned_exit_date: "2027-01-08" }), "2027-01-11")).toBe("çıkış günü geçti");
  });
  it("computes the return", () => {
    expect(positionReturn(pos())).toBeCloseTo(0.1);
  });
});

describe("equity line", () => {
  const pt = (d: string, equity: number, strategy = "kaptan:v1.1-fwd"): PnlPoint => ({
    d,
    strategy,
    equity,
    daily_return: 0,
    peak_equity: equity,
    drawdown: 0,
    n_positions: 0,
    n_trades: 0,
  });
  it("keeps the live strategy's last closes and appends today", () => {
    const pnl = [pt("2027-01-06", 100), pt("2027-01-07", 110), pt("2027-01-08", 105), pt("2027-01-08", 1, "baseline:xu100_bh")];
    expect(equitySeries(pnl, "kaptan:v1.1-fwd", { d: "2027-01-11", equity: 107 }, 2)).toEqual([
      { d: "2027-01-07", equity: 110 },
      { d: "2027-01-08", equity: 105 },
      { d: "2027-01-11", equity: 107 },
    ]);
    expect(equitySeries(pnl, "kaptan:v1.1-fwd", null)).toHaveLength(3);
  });
  it("draws a path and its area, and nothing for a single point", () => {
    const p = linePath([
      { d: "a", equity: 1 },
      { d: "b", equity: 2 },
    ]);
    expect(p.line.startsWith("M")).toBe(true);
    expect(p.area.endsWith("Z")).toBe(true);
    expect(p.last?.y).toBeCloseTo(6);
    expect(linePath([{ d: "a", equity: 1 }]).last).toBeNull();
    expect(linePath([{ d: "a", equity: 1 }, { d: "b", equity: 1 }]).line).toContain("L");
  });
});
