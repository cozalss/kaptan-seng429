import { decodeSession, encodeSession, SESSION_MAX_AGE_S } from "./session";
import { DEMO_PASSPHRASE, passphraseMatches } from "./passphrase";
import { activeNavHref, HOME, href, LEGACY_REDIRECTS, NAV_ITEMS, ROUTES, safeNext } from "@/lib/nav";

describe("passphrase", () => {
  it("matches the demo passphrase exactly", () => {
    expect(passphraseMatches(DEMO_PASSPHRASE)).toBe(true);
    expect(passphraseMatches("kaptan-demo ")).toBe(false);
    expect(passphraseMatches("KAPTAN-DEMO")).toBe(false);
    expect(passphraseMatches("")).toBe(false);
    expect(passphraseMatches("x", "x")).toBe(true);
  });
});

describe("session cookie", () => {
  const payload = { uid: "sen", name: "Sen", iat: 1_000_000 };
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
});

describe("navigation", () => {
  it("lands on Bugün and keeps two items in the top bar", () => {
    expect(HOME).toBe("/bugun");
    expect(NAV_ITEMS.map((r) => r.label)).toEqual(["Bugün", "Portföy"]);
  });
  it("lights Bugün for a proposal and nothing for unknown paths", () => {
    expect(activeNavHref("/bugun")).toBe(ROUTES.bugun);
    expect(activeNavHref("/oneri/p-1")).toBe(ROUTES.bugun);
    expect(activeNavHref("/portfoy")).toBe(ROUTES.portfoy);
    expect(activeNavHref("/ayarlar")).toBeNull();
    expect(activeNavHref("/yok")).toBeNull();
  });
  it("builds proposal links", () => {
    expect(href.proposal("p 1")).toBe("/oneri/p%201");
  });
  it("redirects every older path to one of the three screens", () => {
    const dest = new Map(LEGACY_REDIRECTS.map((r) => [r.source, r.destination]));
    for (const gone of ["/kopru", "/oneriler", "/akis", "/karne", "/ozet", "/kosular/:id", "/tayfa/:agent", "/styleguide", "/runs/:id", "/audit"]) {
      expect(dest.get(gone)).toBe(ROUTES.bugun);
    }
    expect(dest.get("/portfolio")).toBe(ROUTES.portfoy);
    expect(dest.get("/admin")).toBe(ROUTES.ayarlar);
    const live: string[] = [ROUTES.bugun, ROUTES.portfoy, ROUTES.ayarlar];
    for (const r of LEGACY_REDIRECTS) expect(live).toContain(r.destination);
  });
  it("only honours same-site panel paths for ?next=", () => {
    expect(safeNext("/oneri/p1")).toBe("/oneri/p1");
    for (const bad of [null, undefined, "", "/", "//evil.example", "https://evil.example", "/\\evil", "/login", "/login?next=/x"]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
