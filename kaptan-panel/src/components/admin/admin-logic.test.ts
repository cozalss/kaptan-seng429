import { SEED_LIVE_ARM, SEED_UNIVERSE } from "@/mocks/governance";
import { addedByLabel, filterUniverse, isSystemSourced, liveKeys, liveVerdict, normalizeTicker, permissionMatrix, tickerError } from "./admin-logic";

describe("admin logic", () => {
  it("validates tickers the Turkish-aware way", () => {
    expect(normalizeTicker(" krgmd ")).toBe("KRGMD");
    expect(tickerError("")).toBe("Sembol gerekli.");
    expect(tickerError("ab")).not.toBeNull();
    expect(tickerError("krgtk")).toBeNull();
    expect(isSystemSourced("system:restrictions_sync")).toBe(true);
    expect(addedByLabel("system:x")).toBe("Tedbir senkronu (sistem)");
    expect(addedByLabel("u-admin")).toBe("Burak (Admin)");
  });

  it("describes the three live keys and keeps mock mode off", () => {
    const keys = liveKeys(SEED_LIVE_ARM);
    expect(keys.map((k) => [k.id, k.on])).toEqual([["K1", false], ["K2", false], ["K3", false]]);
    const half = liveKeys({ ...SEED_LIVE_ARM, ui_armed_by: "u-admin" })[2]!;
    expect(half.detail).toContain("(1/2)");
    const full = liveKeys({ ...SEED_LIVE_ARM, ui_armed_by: "u-admin", ui_confirmed_by: "u-risk" })[2]!;
    expect(full.on).toBe(true);
    expect(liveVerdict(SEED_LIVE_ARM, { isMock: true, killOn: false }).armed).toBe(false);
    expect(liveVerdict(SEED_LIVE_ARM, { isMock: false, killOn: true }).reason).toContain("Kill switch");
    expect(liveVerdict(SEED_LIVE_ARM, { isMock: false, killOn: false }).reason).toContain("K1");
    const on = { config_live: true, env_enabled: true, ui_armed_by: "u-admin", ui_confirmed_by: "u-risk", armed: true, expires_at: null };
    expect(liveVerdict(on, { isMock: false, killOn: false }).armed).toBe(true);
    expect(liveVerdict({ ...on, armed: false }, { isMock: false, killOn: false }).reason).toContain("K3");
  });

  it("builds the permission matrix from ROLE_PERMS", () => {
    const m = permissionMatrix();
    const approve = m.find((r) => r.perm === "approve")!;
    expect(approve.roles).toEqual({ analyst: false, risk_officer: true, admin: false, auditor: false });
    expect(approve.stepUp).toBe(true);
    expect(m.find((r) => r.perm === "audit_export")!.roles.auditor).toBe(true);
  });

  it("filters the universe by text and membership", () => {
    expect(filterUniverse(SEED_UNIVERSE, "ornek", false).every((r) => r.ticker.startsWith("ORN") || r.company_name.includes("ÖRNEK"))).toBe(true);
    expect(filterUniverse(SEED_UNIVERSE, "enerji", false).length).toBeGreaterThan(0);
    expect(filterUniverse(SEED_UNIVERSE, "", true).every((r) => r.in_universe)).toBe(true);
  });
});
