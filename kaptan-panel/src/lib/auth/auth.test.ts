import { can, deniedHint, ROLE_PERMS, STEP_UP } from "./permissions";
import { canAccessPath, homeFor, PANEL_ROUTES, routeFor, routesFor, safeNext } from "./routes";
import { decodeSession, encodeSession, SESSION_MAX_AGE_S } from "./session";
import { accountForRole, authenticateDemo, DEMO_ACCOUNTS, DEMO_PASSWORD, findAccountByUid } from "./accounts";

describe("permissions (09 §5)", () => {
  it("keeps segregation of duties: only the Risk Officer approves", () => {
    expect(can("risk_officer", "approve")).toBe(true);
    expect(can("admin", "approve")).toBe(false);
    expect(can("analyst", "approve")).toBe(false);
    expect(can("auditor", "approve")).toBe(false);
  });
  it("splits the kill-switch reset: Admin initiates, Risk Officer confirms (Ç-8)", () => {
    expect(can("admin", "kill_reset_init")).toBe(true);
    expect(can("admin", "kill_reset_confirm")).toBe(false);
    expect(can("risk_officer", "kill_reset_confirm")).toBe(true);
    expect(can("risk_officer", "kill_reset_init")).toBe(false);
  });
  it("gives the auditor no mutating permission", () => {
    expect([...ROLE_PERMS.auditor].sort()).toEqual(["audit_export", "view"]);
  });
  it("lets only the Admin inject demo disclosures", () => {
    expect((["analyst", "risk_officer", "auditor"] as const).some((r) => can(r, "demo_inject"))).toBe(false);
    expect(can("admin", "demo_inject")).toBe(true);
  });
  it("denies everything without a role", () => {
    expect(can(null, "view")).toBe(false);
  });
  it("requires step-up for approve and reset", () => {
    expect(STEP_UP.has("approve")).toBe(true);
    expect(STEP_UP.has("kill_reset_confirm")).toBe(true);
    expect(STEP_UP.has("view")).toBe(false);
  });
  it("explains a denial in Turkish, with a generic fallback", () => {
    expect(deniedHint("approve")).toMatch(/Risk Officer/);
    expect(deniedHint("users")).toBe("Bu işlem rolünüze kapalı.");
  });
});

describe("routes", () => {
  it("opens every view route to all roles except /admin", () => {
    for (const r of PANEL_ROUTES) {
      const expected = r.href === "/admin" ? ["admin"] : ["analyst", "risk_officer", "admin", "auditor"];
      expect([...r.roles].sort()).toEqual([...expected].sort());
    }
  });
  it("guards /admin and resolves nested paths", () => {
    expect(canAccessPath("risk_officer", "/admin")).toBe(false);
    expect(canAccessPath("admin", "/admin")).toBe(true);
    expect(canAccessPath("auditor", "/runs/run-demo-e3-ornek")).toBe(true);
    expect(routeFor("/runs/x")?.href).toBe("/runs");
  });
  it("lets unknown paths fall through to not-found", () => {
    expect(canAccessPath("analyst", "/yetkisiz")).toBe(true);
  });
  it("sends the Risk Officer to the queue and everyone else to the feed", () => {
    expect(homeFor("risk_officer")).toBe("/approvals");
    expect(homeFor("auditor")).toBe("/inbox");
  });
  it("hides /admin from non-admin navigation", () => {
    expect(routesFor("analyst").some((r) => r.href === "/admin")).toBe(false);
    expect(routesFor("admin").some((r) => r.href === "/admin")).toBe(true);
  });
  it("only accepts same-origin relative next paths", () => {
    expect(safeNext("/audit?x=1")).toBe("/audit?x=1");
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("/\\evil")).toBeNull();
    expect(safeNext("/login")).toBeNull();
    expect(safeNext(undefined)).toBeNull();
  });
  it("gives every route a unique go-key", () => {
    const keys = PANEL_ROUTES.map((r) => r.goKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("mock session codec", () => {
  const payload = { uid: "u-risk", email: "risk@kaptan.demo", name: "Zeynep Ş.", role: "risk_officer" as const, iat: 1_000 };
  it("round-trips Turkish characters", () => {
    expect(decodeSession(encodeSession(payload), 2_000)).toEqual(payload);
  });
  it("rejects expired, malformed and missing cookies without throwing", () => {
    expect(decodeSession(encodeSession(payload), 1_000 + SESSION_MAX_AGE_S * 1000 + 1)).toBeNull();
    expect(decodeSession("%%%not-base64")).toBeNull();
    expect(decodeSession(encodeSession(payload).slice(0, 10))).toBeNull();
    expect(decodeSession(null)).toBeNull();
  });
});

describe("demo accounts", () => {
  it("authenticates the seeded accounts with the shared demo password", () => {
    for (const a of DEMO_ACCOUNTS) expect(authenticateDemo(a.email, DEMO_PASSWORD)?.uid).toBe(a.uid);
  });
  it("rejects a wrong password", () => {
    expect(authenticateDemo("risk@kaptan.demo", "yanlis")).toBeNull();
  });
  it("maps every role to an account", () => {
    expect(accountForRole("auditor").uid).toBe("u-denetci");
    expect(findAccountByUid("u-risk2")?.role).toBe("risk_officer");
  });
});
