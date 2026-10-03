import type { PnlPoint } from "@/lib/domain";
import { paperPnl } from "@/mocks/pnl";
import { cumulativeReturns, drawdownRows, lastValues, niceTicks, returnDomain, spreadLabels, withLivePoint } from "./series";

const pt = (d: string, strategy: PnlPoint["strategy"], equity: number, daily_return: number, drawdown = 0): PnlPoint => ({
  d,
  strategy,
  equity,
  daily_return,
  peak_equity: equity,
  drawdown,
  n_positions: 0,
  n_trades: 0,
});

describe("cumulativeReturns", () => {
  const pts = [
    pt("2026-11-09", "kaptan:v1.0-fwd", 1_010_000, 0.01),
    pt("2026-11-10", "kaptan:v1.0-fwd", 1_020_100, 0.01),
    pt("2026-11-10", "baseline:xu100_bh", 990_000, -0.01),
  ];
  it("measures each series from its own start capital", () => {
    const rows = cumulativeReturns(pts, ["kaptan:v1.0-fwd", "baseline:xu100_bh"]);
    expect(rows.map((r) => r.d)).toEqual(["2026-11-09", "2026-11-10"]);
    expect(rows[0]?.values["kaptan:v1.0-fwd"]).toBeCloseTo(0.01);
    expect(rows[1]?.values["kaptan:v1.0-fwd"]).toBeCloseTo(0.0201);
    expect(rows[1]?.values["baseline:xu100_bh"]).toBeCloseTo(-0.01);
  });
  it("rebases every series to zero on the common start", () => {
    const rows = cumulativeReturns(pts, ["kaptan:v1.0-fwd"], "2026-11-10");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.values["kaptan:v1.0-fwd"]).toBe(0);
  });
  it("skips strategies without points", () => {
    expect(cumulativeReturns(pts, ["kaptan:v1.1-fwd"])).toEqual([]);
  });
  it("matches the fixture's own start capital (1.000.000 TL)", () => {
    const rows = cumulativeReturns(paperPnl(), ["kaptan:v1.1-fwd"]);
    const last = lastValues(rows, ["kaptan:v1.1-fwd"])["kaptan:v1.1-fwd"] as number;
    expect(last).toBeCloseTo(1_016_480 / 1_000_000 - 1, 4);
  });
});

describe("live point and drawdown rows", () => {
  const rows = [{ d: "2027-01-08", values: { "kaptan:v1.1-fwd": 0.02 } }];
  it("compounds today's P&L onto the last close", () => {
    const out = withLivePoint(rows, "kaptan:v1.1-fwd", "2027-01-11", -0.01);
    expect(out[1]).toMatchObject({ d: "2027-01-11", live: true });
    expect(out[1]?.values["kaptan:v1.1-fwd"]).toBeCloseTo(1.02 * 0.99 - 1);
  });
  it("does not append when today is already closed or the series is missing", () => {
    expect(withLivePoint(rows, "kaptan:v1.1-fwd", "2027-01-08", -0.01)).toHaveLength(1);
    expect(withLivePoint(rows, "kaptan:v1.0-fwd", "2027-01-11", -0.01)).toHaveLength(1);
  });
  it("builds drawdown rows with the live intraday values", () => {
    const pts = [pt("2027-01-08", "kaptan:v1.1-fwd", 1, 0.001, -0.01), pt("2027-01-07", "kaptan:v1.1-fwd", 1, -0.002, -0.008)];
    const out = drawdownRows(pts, "kaptan:v1.1-fwd", { today: "2027-01-11", drawdown: -0.0521, daily: -0.045 });
    expect(out.map((r) => r.d)).toEqual(["2027-01-07", "2027-01-08", "2027-01-11"]);
    expect(out[2]).toEqual({ d: "2027-01-11", live: true, drawdown: -0.0521, daily: -0.045 });
    expect(drawdownRows(pts, "kaptan:v1.1-fwd")).toHaveLength(2);
  });
});

describe("axes and labels", () => {
  it("returnDomain includes zero and pads to half-percent steps", () => {
    const [lo, hi] = returnDomain([0.012, 0.031]);
    expect(lo).toBeLessThanOrEqual(0);
    expect(hi).toBeGreaterThanOrEqual(0.031);
    expect(Math.round(hi * 1000) % 5).toBe(0);
  });
  it("niceTicks uses 1/2/2.5/5 steps and covers the domain", () => {
    expect(niceTicks([-0.06, 0], 4)).toEqual([-0.06, -0.04, -0.02, 0]);
    expect(niceTicks([0.6, 1], 5)).toEqual([0.6, 0.7, 0.8, 0.9, 1]);
    expect(niceTicks([1, 1])).toEqual([1]);
    expect(niceTicks([-0.05, 0], 3)).toEqual([-0.05, -0.025, 0]);
  });
  it("spreadLabels removes overlaps and keeps labels inside the plot", () => {
    const out = spreadLabels(
      [
        { key: "a", text: "a", y: 100 },
        { key: "b", text: "b", y: 104 },
        { key: "c", text: "c", y: 198 },
      ],
      15,
      10,
      200,
    );
    const ys = out.map((l) => l.y);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(15);
    expect(Math.max(...ys)).toBeLessThanOrEqual(200);
    const crowd = spreadLabels(
      [
        { key: "a", text: "a", y: 195 },
        { key: "b", text: "b", y: 196 },
        { key: "c", text: "c", y: 197 },
      ],
      15,
      10,
      200,
    );
    expect(crowd.map((l) => l.y)).toEqual([170, 185, 200]);
  });
});
