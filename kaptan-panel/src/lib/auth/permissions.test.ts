import { ACTION_LABEL, ACTIONS, can, canOpen, deniedReason, roleThatCan, rolesFor, ROLE_ACTIONS } from "./permissions";
import { memberByUid, memberForRole, ROLE_LABEL, ROLE_LINE, ROLES, TEAM } from "@/lib/domain/user";

describe("can(role, action)", () => {
  it("follows the canon: only the Risk Sorumlusu signs, Yönetici starts and Risk confirms a restart", () => {
    expect(rolesFor("proposal.decide")).toEqual(["risk_officer"]);
    expect(rolesFor("kill.stop")).toEqual(["risk_officer", "admin"]);
    expect(rolesFor("kill.reset_start")).toEqual(["admin"]);
    expect(rolesFor("kill.reset_confirm")).toEqual(["risk_officer"]);
    expect(rolesFor("limits.propose")).toEqual(["admin"]);
    expect(rolesFor("limits.decide")).toEqual(["risk_officer"]);
    expect(rolesFor("demo.run")).toEqual(["admin"]);
  });
  it("keeps the Analist to notes and the Denetçi read-only", () => {
    expect([...ROLE_ACTIONS.analyst]).toEqual(["proposal.note"]);
    const writes = ACTIONS.filter((a) => a !== "audit.verify" && a !== "users.view");
    for (const a of writes) expect(can("auditor", a)).toBe(false);
    expect(can("auditor", "audit.verify")).toBe(true);
    expect(can(null, "proposal.note")).toBe(false);
  });
  it("never lets one role both start and confirm, or propose and approve", () => {
    for (const r of ROLES) {
      expect(can(r, "kill.reset_start") && can(r, "kill.reset_confirm")).toBe(false);
      expect(can(r, "limits.propose") && can(r, "limits.decide")).toBe(false);
    }
  });
  it("labels every action", () => {
    for (const a of ACTIONS) expect(ACTION_LABEL[a]).toBeTruthy();
  });
});

describe("plain reasons", () => {
  it("names who does it", () => {
    expect(deniedReason("proposal.decide")).toBe("Bunu Risk Sorumlusu yapar.");
    expect(deniedReason("kill.stop")).toBe("Bunu Risk Sorumlusu ya da Yönetici yapar.");
    expect(deniedReason("proposal.note")).toBe("Bunu Analist, Risk Sorumlusu ya da Yönetici yapar.");
    expect(deniedReason("proposal.decide", "auditor")).toBe("Denetçi yalnızca bakar. Bunu Risk Sorumlusu yapar.");
  });
  it("offers a role that can (never the Denetçi)", () => {
    expect(roleThatCan("proposal.decide")).toBe("risk_officer");
    expect(roleThatCan("users.view")).toBe("admin");
    expect(roleThatCan("audit.verify")).toBe("risk_officer");
  });
});

describe("route guards", () => {
  it("opens every screen to every role and nothing when signed out", () => {
    for (const r of ROLES) for (const p of ["/bugun", "/oneri/x", "/portfoy", "/denetim", "/ayarlar", "/yok"]) expect(canOpen(r, p)).toBe(true);
    expect(canOpen(null, "/bugun")).toBe(false);
  });
});

describe("team", () => {
  it("has one member on duty for each role and a line for each", () => {
    for (const r of ROLES) {
      expect(memberForRole(r).role).toBe(r);
      expect(ROLE_LABEL[r]).toBeTruthy();
      expect(ROLE_LINE[r]).toBeTruthy();
    }
    expect(TEAM).toHaveLength(5);
    expect(memberByUid("user:uye-3")?.name).toBe("Üye 3");
    expect(memberByUid("yok")).toBeNull();
    expect(memberByUid(null)).toBeNull();
  });
});
