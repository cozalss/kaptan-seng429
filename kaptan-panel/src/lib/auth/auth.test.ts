import { decodeSession, encodeSession, SESSION_MAX_AGE_S } from "./session";
import { TEST_PASSPHRASE, passphraseMatches } from "./passphrase";
import { activeNavHref, HOME, href, LEGACY_REDIRECTS, NAV_ITEMS, ROUTES, safeNext } from "@/lib/nav";

describe("passphrase", () => {
  it("matches the test passphrase exactly", () => {
    expect(passphraseMatches(TEST_PASSPHRASE)).toBe(true);
    expect(passphraseMatches("kaptan2026 ")).toBe(false);
    expect(passphraseMatches("KAPTAN-DEMO")).toBe(false);
    expect(passphraseMatches("")).toBe(false);
    expect(passphraseMatches("x", "x")).toBe(true);
  });
});

describe("session cookie", () => {
  const payload = { uid: "sen", name: "Deniz", iat: 1_000_000 };
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
  it("ignores a role left in an old cookie", () => {
    const old = btoa(JSON.stringify({ ...payload, role: "risk_officer" })).replace(/=+$/, "");
    expect(decodeSession(old, 1_000_001)).toEqual(payload);
  });
});

describe("navigation", () => {
  it("lands on the home and keeps four items in the top bar", () => {
    expect(HOME).toBe("/benim");
    expect(NAV_ITEMS.map((r) => r.label)).toEqual(["Ana sayfa", "Param", "Okunanlar", "Geçmiş"]);
  });
  it("lights Ana sayfa for a proposal and nothing for unknown paths or Ayarlar", () => {
    expect(activeNavHref("/benim")).toBe(ROUTES.benim);
    expect(activeNavHref("/oneri/p-1")).toBe(ROUTES.benim);
    expect(activeNavHref("/portfoy")).toBe(ROUTES.portfoy);
    expect(activeNavHref("/gecmis")).toBe(ROUTES.gecmis);
    expect(activeNavHref("/bildirimler")).toBe(ROUTES.bildirimler);
    expect(activeNavHref("/ayarlar")).toBeNull();
    expect(activeNavHref("/yok")).toBeNull();
  });
  it("builds proposal links", () => {
    expect(href.proposal("p 1")).toBe("/oneri/p%201");
  });
  it("redirects every older path to the closest screen", () => {
    const dest = new Map(LEGACY_REDIRECTS.map((r) => [r.source, r.destination]));
    for (const gone of ["/bugun", "/kopru", "/oneriler", "/akis", "/karne", "/ozet", "/kosular/:id", "/tayfa/:agent", "/styleguide", "/runs/:id"]) {
      expect(dest.get(gone)).toBe(ROUTES.benim);
    }
    expect(dest.get("/denetim")).toBe(ROUTES.gecmis);
    expect(dest.get("/audit")).toBe(ROUTES.gecmis);
    expect(dest.get("/portfolio")).toBe(ROUTES.portfoy);
    expect(dest.get("/admin")).toBe(ROUTES.ayarlar);
    expect(dest.get("/login/:rol+")).toBe(ROUTES.login);
    const live: string[] = [ROUTES.benim, ROUTES.portfoy, ROUTES.gecmis, ROUTES.ayarlar, ROUTES.login];
    for (const r of LEGACY_REDIRECTS) expect(live).toContain(r.destination);
  });
  it("only honours same-site app paths for ?next=", () => {
    expect(safeNext("/oneri/p1")).toBe("/oneri/p1");
    for (const bad of [null, undefined, "", "/", "//evil.example", "https://evil.example", "/\\evil", "/login", "/login?next=/x"]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
