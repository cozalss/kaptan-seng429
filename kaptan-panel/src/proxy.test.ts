// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** The proxy reads its build flags at import, so each case imports a fresh copy. */
async function loadProxy(build: "real" | "double" | "site") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_KAPTAN_TEST_DOUBLE", build === "double" ? "1" : "");
  vi.stubEnv("NEXT_PUBLIC_KAPTAN_SITE_ONLY", build === "site" ? "1" : "0");
  return (await import("./proxy")).proxy;
}

function req(path: string, cookie?: string) {
  return new NextRequest(new URL(path, "http://localhost:3100"), cookie ? { headers: { cookie } } : undefined);
}

afterEach(() => vi.unstubAllEnvs());

describe("proxy (a real build)", () => {
  it("lets a signed-in person through with the secure refresh cookie", async () => {
    const proxy = await loadProxy("real");
    expect(proxy(req("/benim", "__Host-kaptan_rt=x")).headers.get("location")).toBeNull();
  });

  it("accepts the plain-http refresh cookie the API sets when COOKIE_SECURE=false", async () => {
    const proxy = await loadProxy("real");
    expect(proxy(req("/benim", "kaptan_rt=x")).headers.get("location")).toBeNull();
  });

  it("sends a signed-out visitor to /login with the path carried in ?next=", async () => {
    const proxy = await loadProxy("real");
    expect(proxy(req("/portfoy")).headers.get("location")).toBe("http://localhost:3100/login?next=%2Fportfoy");
  });

  it("does not take the test double's cookie for a session", async () => {
    const { encodeSession, SESSION_COOKIE } = await import("@/lib/auth/session");
    const proxy = await loadProxy("real");
    const cookie = `${SESSION_COOKIE}=${encodeSession({ uid: "sen", name: "Deniz", iat: Date.now() })}`;
    expect(proxy(req("/benim", cookie)).headers.get("location")).toBe("http://localhost:3100/login?next=%2Fbenim");
  });

  it("never needs a session for the landing", async () => {
    const proxy = await loadProxy("real");
    expect(proxy(req("/")).headers.get("location")).toBeNull();
  });

  it("gives every page its own nonce, in the policy and to Next's renderer", async () => {
    const proxy = await loadProxy("real");
    const first = proxy(req("/login")).headers;
    const second = proxy(req("/login")).headers;
    const nonce = /'nonce-([^']+)'/.exec(first.get("content-security-policy") ?? "")?.[1];
    expect(nonce).toBeTruthy();
    expect(second.get("content-security-policy")).not.toContain(nonce);
    // Next forwards request-header overrides with this prefix.
    expect(first.get("x-middleware-request-content-security-policy")).toContain(`'nonce-${nonce}'`);
  });
});

describe("proxy (the test double)", () => {
  async function signedIn() {
    const { encodeSession, SESSION_COOKIE } = await import("@/lib/auth/session");
    return `${SESSION_COOKIE}=${encodeSession({ uid: "sen", name: "Deniz", iat: Date.now() })}`;
  }

  it("lets a signed-in person open the home", async () => {
    const proxy = await loadProxy("double");
    expect(proxy(req("/benim", await signedIn())).headers.get("location")).toBeNull();
  });

  it("sends a signed-out visitor of the home to sign in first", async () => {
    const proxy = await loadProxy("double");
    expect(proxy(req("/benim")).headers.get("location")).toBe("http://localhost:3100/login?next=%2Fbenim");
  });

  it("sends a signed-in visitor of /login home", async () => {
    const proxy = await loadProxy("double");
    expect(proxy(req("/login", await signedIn())).headers.get("location")).toBe("http://localhost:3100/benim");
  });
});

describe("proxy (the public website)", () => {
  it.each(["/login", "/benim", "/oneri/x", "/gecmis", "/ayarlar", "/boyle-bir-yol"])("shows the one honest page on %s, with no redirect", async (path) => {
    const proxy = await loadProxy("site");
    const res = proxy(req(path));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost:3100/burada-acilmaz");
    expect(res.headers.get("content-security-policy")).toContain("'nonce-");
  });

  it("leaves the landing alone", async () => {
    const proxy = await loadProxy("site");
    expect(proxy(req("/")).headers.get("x-middleware-rewrite")).toBeNull();
  });
});
