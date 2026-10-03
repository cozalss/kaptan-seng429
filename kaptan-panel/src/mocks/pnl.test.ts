import { describe, expect, it } from "vitest";
import { initialState } from "@/lib/api/mock/state";
import { riskStatus } from "@/lib/api/mock/selectors";
import { lastPoint, liveEquity, LIVE_STRATEGY } from "./pnl";

describe("live equity (one source for risk status and charts)", () => {
  it("measures today's drawdown against the fixture's own running peak", () => {
    const last = lastPoint(LIVE_STRATEGY);
    expect(last).toBeDefined();
    const flat = liveEquity(0);
    expect(flat.equity).toBe(last?.equity);
    expect(flat.peak).toBe(last?.peak_equity);
    expect(flat.drawdown).toBeCloseTo(last?.drawdown ?? NaN, 4);
  });

  it("riskStatus at 13:40 continues the chart without stepping back", () => {
    const status = riskStatus(initialState(0));
    const last = lastPoint(LIVE_STRATEGY);
    expect(status.peak_equity).toBe(last?.peak_equity);
    // +0.21% today: today's drawdown is a little better than yesterday's close, never worse.
    expect(status.drawdown_pct).toBeGreaterThan(last?.drawdown ?? 0);
    expect(status.drawdown_pct).toBeCloseTo(status.equity / status.peak_equity - 1, 4);
  });

  it("a new high resets the drawdown to zero", () => {
    expect(liveEquity(0.05).drawdown).toBe(0);
  });
});
