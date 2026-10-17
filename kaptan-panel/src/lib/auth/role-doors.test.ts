import { LoginRequest, ROLES } from "@/lib/domain/user";
import { isPublicPath, safeNext } from "@/lib/nav";
import { doorPeople, loginHref, ROLE_DOOR, ROLE_SLUG, ROLE_SLUGS, roleFromSlug } from "./role-doors";

describe("role doors: slug ↔ role", () => {
  it("maps every role to a distinct ASCII slug and back", () => {
    expect(ROLE_SLUGS).toEqual(["analist", "risk", "yonetici", "denetci"]);
    for (const role of ROLES) {
      expect(ROLE_SLUG[role]).toMatch(/^[a-z]+$/);
      expect(roleFromSlug(ROLE_SLUG[role])).toBe(role);
    }
  });
  it("returns null for unknown, empty or role-key slugs", () => {
    for (const bad of [undefined, null, "", "Risk", "risk_officer", "admin", "kral", "risk/"]) {
      expect(roleFromSlug(bad)).toBeNull();
    }
  });
  it("builds door links and carries ?next= encoded", () => {
    expect(loginHref(null)).toBe("/login");
    expect(loginHref("risk_officer")).toBe("/login/risk");
    expect(loginHref("auditor", "/oneri/p 1")).toBe("/login/denetci?next=%2Foneri%2Fp%201");
    expect(loginHref(null, "/portfoy")).toBe("/login?next=%2Fportfoy");
  });
  it("gives every door one line and two or three things you do", () => {
    expect(ROLE_DOOR.risk_officer.line).toBe("Son imzayı sen atarsın.");
    expect(ROLE_DOOR.auditor.line).toBe("Her şeyi görürsün, hiçbir şeye dokunmazsın.");
    expect(ROLE_DOOR.admin.line).toBe("Ekibi, sınırları ve senaryoları sen yönetirsin.");
    for (const role of ROLES) expect(ROLE_DOOR[role].does.length).toBeGreaterThanOrEqual(2);
  });
  it("names each door by the role's verb, in capitals and distinct", () => {
    expect(ROLES.map((r) => ROLE_DOOR[r].verb)).toEqual(["OKUR", "İMZALAR", "KURAR", "GÖZETLER"]);
    for (const role of ROLES) expect(ROLE_DOOR[role].verb).toBe(ROLE_DOOR[role].verb.toLocaleUpperCase("tr"));
  });
  it("names who sits behind each door", () => {
    expect(doorPeople("admin")).toBe("Üye 1");
    expect(doorPeople("analyst")).toBe("Üye 2 · Üye 4");
    expect(doorPeople("risk_officer")).toBe("Üye 3");
    expect(doorPeople("auditor")).toMatch(/Jüri/);
  });
});

describe("login request (zod)", () => {
  it("accepts a passphrase alone, with next, and with any known role", () => {
    expect(LoginRequest.parse({ passphrase: "x" })).toEqual({ passphrase: "x" });
    for (const role of ROLES) expect(LoginRequest.parse({ passphrase: "x", role, next: "/bugun" }).role).toBe(role);
    expect(LoginRequest.parse({ passphrase: "x", next: null }).next).toBeNull();
  });
  it("refuses an unknown role, a slug in place of a role, and oversize fields", () => {
    for (const body of [
      { passphrase: "x", role: "kral" },
      { passphrase: "x", role: "risk" },
      { passphrase: "x", role: 3 },
      { passphrase: "x".repeat(201) },
      { passphrase: "x", next: "/".repeat(501) },
      { role: "analyst" },
      null,
    ]) {
      expect(LoginRequest.safeParse(body).success).toBe(false);
    }
  });
});

describe("public paths", () => {
  it("treats /login and every door as public, nothing else", () => {
    for (const p of ["/login", "/login/risk", "/login/analist"]) expect(isPublicPath(p)).toBe(true);
    for (const p of ["/", "/bugun", "/loginx", "/oneri/login"]) expect(isPublicPath(p)).toBe(false);
  });
  it("never sends you back to a door after sign-in", () => {
    for (const bad of ["/login/risk", "/login/risk?next=/x", "/login#a"]) expect(safeNext(bad)).toBeNull();
    expect(safeNext("/portfoy?x=1")).toBe("/portfoy?x=1");
  });
});
