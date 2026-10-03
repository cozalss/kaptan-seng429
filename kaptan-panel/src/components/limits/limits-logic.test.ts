import { LIMITS_V1, type LimitVersion } from "@/lib/domain";
import { SEED_LIMIT_VERSIONS } from "@/mocks/governance";
import {
  baselineFor,
  changedCount,
  collectChanges,
  diffLimits,
  effectOf,
  formatLimit,
  fourEyes,
  parseLimitInput,
  toInputText,
  unitLabel,
} from "./limits-logic";

describe("limit formatting", () => {
  it("prints each unit the Turkish way", () => {
    expect(formatLimit("risk_per_trade_pct", 0.005)).toBe("%0,5");
    expect(formatLimit("daily_loss_halt_pct", -0.01)).toBe("−%1");
    expect(formatLimit("max_concurrent_positions", 10)).toBe("10");
    expect(formatLimit("min_edge_cost_ratio", 2)).toBe("2×");
    expect(formatLimit("crisis_exposure_mult", 0.5)).toBe("×0,5");
    expect(unitLabel("price_band_pct")).toBe("%");
    expect(unitLabel("max_concurrent_positions")).toBe("adet");
    expect(unitLabel("min_edge_cost_ratio")).toBe("kat");
    expect(unitLabel("crisis_exposure_mult")).toBe("çarpan");
    expect(toInputText("risk_per_trade_pct", 0.005)).toBe("0,5");
    expect(toInputText("max_concurrent_positions", 10)).toBe("10");
  });
});

describe("parseLimitInput", () => {
  it("accepts comma decimals and converts percentage points", () => {
    expect(parseLimitInput("risk_per_trade_pct", "0,75", 0.005)).toEqual({ ok: true, value: 0.0075 });
    expect(parseLimitInput("daily_loss_halt_pct", "−2", -0.01)).toEqual({ ok: true, value: -0.02 });
    expect(parseLimitInput("max_concurrent_positions", "12", 10)).toEqual({ ok: true, value: 12 });
    expect(parseLimitInput("min_edge_cost_ratio", "2,5", 2)).toEqual({ ok: true, value: 2.5 });
    expect(parseLimitInput("crisis_exposure_mult", "0,4", 0.5)).toEqual({ ok: true, value: 0.4 });
  });
  it("rejects nonsense with a reason", () => {
    expect(parseLimitInput("risk_per_trade_pct", "", 0.005).ok).toBe(false);
    expect(parseLimitInput("risk_per_trade_pct", "abc", 0.005).ok).toBe(false);
    expect(parseLimitInput("risk_per_trade_pct", "0", 0.005).ok).toBe(false);
    expect(parseLimitInput("daily_loss_halt_pct", "1", -0.01)).toEqual({ ok: false, error: "Zarar eşiği negatif olmalı." });
    expect(parseLimitInput("max_position_pct", "-5", 0.1)).toEqual({ ok: false, error: "Pozitif olmalı." });
    expect(parseLimitInput("max_position_pct", "150", 0.1).ok).toBe(false);
    expect(parseLimitInput("max_concurrent_positions", "2,5", 10).ok).toBe(false);
    expect(parseLimitInput("min_edge_cost_ratio", "0,5", 2).ok).toBe(false);
    expect(parseLimitInput("crisis_exposure_mult", "2", 0.5).ok).toBe(false);
  });
});

describe("diffs and four-eyes", () => {
  it("diffs two versions and tells looser from tighter", () => {
    const [v1, v2] = SEED_LIMIT_VERSIONS as [LimitVersion, LimitVersion];
    const rows = diffLimits(v1.values, v2.values);
    expect(changedCount(rows)).toBe(1);
    const row = rows.find((r) => r.changed)!;
    expect(row).toMatchObject({ key: "target_concurrent_positions", before: 8, after: 9, effect: "looser" });
    expect(effectOf("min_edge_cost_ratio", 2, 3)).toBe("tighter");
    expect(effectOf("daily_loss_halt_pct", -0.01, -0.02)).toBe("looser");
    expect(effectOf("price_band_pct", 0.02, 0.02)).toBeNull();
    expect(diffLimits([], [{ key: "max_group_pct", value: 0.2 }])[0]).toMatchObject({ before: null, changed: true, effect: null });
  });
  it("uses the latest active/superseded earlier version as the baseline", () => {
    const proposed = { ...SEED_LIMIT_VERSIONS[0]!, version: 3, status: "proposed" as const };
    expect(baselineFor(proposed, [...SEED_LIMIT_VERSIONS, proposed])?.version).toBe(1);
    expect(baselineFor(SEED_LIMIT_VERSIONS[0]!, SEED_LIMIT_VERSIONS)).toBeUndefined();
  });
  it("blocks the proposer, other roles and decided versions", () => {
    const me = { uid: "u-risk", canApprove: true, deniedReason: "x" };
    expect(fourEyes({ status: "proposed", created_by: "u-admin" }, me)).toEqual({ canDecide: true, reason: null });
    expect(fourEyes({ status: "proposed", created_by: "u-risk" }, me).reason).toBe("Öneren onaylayamaz (dört göz).");
    expect(fourEyes({ status: "proposed", created_by: "u-admin" }, { ...me, canApprove: false }).reason).toBe("x");
    expect(fourEyes({ status: "active", created_by: "u-admin" }, me).canDecide).toBe(false);
  });
  it("collects only real changes from the edit grid", () => {
    const r = collectChanges(LIMITS_V1, { target_concurrent_positions: "9", price_band_pct: "2", risk_per_trade_pct: "x" });
    expect(r.changes).toEqual([{ key: "target_concurrent_positions", value: 9 }]);
    expect(Object.keys(r.errors)).toEqual(["risk_per_trade_pct"]);
    expect(collectChanges(LIMITS_V1, { price_band_pct: "2,0" }).changes).toEqual([]);
  });
});
