import { decodeSession, encodeSession, SESSION_MAX_AGE_S } from "./session";
import { DEMO_PASSPHRASE, passphraseMatches } from "./passphrase";
import { activeNavHref, HOME, href, LEGACY_REDIRECTS, NAV_ITEMS, ROUTES, safeNext } from "@/lib/nav";

describe("passphrase", () => {
  it("matches the demo passphrase exactly", () => {
    expect(passphraseMatches(DEMO_PASSPHRASE)).toBe(true);
    expect(passphraseMatches("kaptan2026 ")).toBe(false);
    expect(passphraseMatches("KAPTAN-DEMO")).toBe(false);
    expect(passphraseMatches("")).toBe(false);
    expect(passphraseMatches("x", "x")).toBe(true);
  });
});

describe("session cookie", () => {
  const payload = { uid: "uye-3", name: "Üye 3", role: "risk_officer" as const, iat: 1_000_000 };
  it("round-trips a payload (Turkish characters included)", () => {
    const raw = encodeSession({ ...payload, name: "Şen Öz" });
    expect(raw).not.toMatch(/[+/=]/);
    expect(decodeSession(raw, 1_000_001)).toEqual({ ...payload, name: "Şen Öz" });
  });
  it("returns null for missing, malformed or expired cookies", () => {
    expect(decodeSession(undefined)).toBeNull();
    expect(decodeSession("%%%")).toBeNull();
    expect(decodeSession(btoa(JSON.stringify({ uid: "" })))).toBeNull();
    expect(decodeSession(encodeSession(payload), payload.iat + SESSION_MAX_AGE_S * 1000 + 1)).toBeNull();
  });
  it("reads an old cookie without a role as the default role, and refuses an unknown role", () => {
    const old = btoa(JSON.stringify({ uid: "x", name: "X", iat: 1_000_000 })).replace(/=+$/, "");
    expect(decodeSession(old, 1_000_001)?.role).toBe("risk_officer");
    const bad = btoa(JSON.stringify({ uid: "x", name: "X", role: "kral", iat: 1_000_000 })).replace(/=+$/, "");
    expect(decodeSession(bad, 1_000_001)).toBeNull();
  });
});

describe("navigation", () => {
  it("lands on Bugün and keeps three items in the top bar", () => {
    expect(HOME).toBe("/bugun");
    expect(NAV_ITEMS.map((r) => r.label)).toEqual(["Bugün", "Portföy", "Denetim"]);
  });
  it("lights Bugün for a proposal and nothing for unknown paths", () => {
    expect(activeNavHref("/bugun")).toBe(ROUTES.bugun);
    expect(activeNavHref("/oneri/p-1")).toBe(ROUTES.bugun);
    expect(activeNavHref("/portfoy")).toBe(ROUTES.portfoy);
    expect(activeNavHref("/denetim")).toBe(ROUTES.denetim);
    expect(activeNavHref("/ayarlar")).toBeNull();
    expect(activeNavHref("/yok")).toBeNull();
  });
  it("builds proposal links", () => {
    expect(href.proposal("p 1")).toBe("/oneri/p%201");
  });
  it("redirects every older path to one of the three screens", () => {
    const dest = new Map(LEGACY_REDIRECTS.map((r) => [r.source, r.destination]));
    for (const gone of ["/kopru", "/oneriler", "/akis", "/karne", "/ozet", "/kosular/:id", "/tayfa/:agent", "/styleguide", "/runs/:id"]) {
      expect(dest.get(gone)).toBe(ROUTES.bugun);
    }
    expect(dest.get("/portfolio")).toBe(ROUTES.portfoy);
    expect(dest.get("/audit")).toBe(ROUTES.denetim);
    expect(dest.get("/admin")).toBe(ROUTES.ayarlar);
    const live: string[] = [ROUTES.bugun, ROUTES.portfoy, ROUTES.denetim, ROUTES.ayarlar];
    for (const r of LEGACY_REDIRECTS) expect(live).toContain(r.destination);
  });
  it("only honours same-site panel paths for ?next=", () => {
    expect(safeNext("/oneri/p1")).toBe("/oneri/p1");
    for (const bad of [null, undefined, "", "/", "//evil.example", "https://evil.example", "/\\evil", "/login", "/login?next=/x"]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
