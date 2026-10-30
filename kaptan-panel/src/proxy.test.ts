// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** The proxy reads NEXT_PUBLIC_API_MODE at import, so each case imports a fresh copy. */
async function loadProxy(mode: "http" | "mock") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_MODE", mode);
  return (await import("./proxy")).proxy;
}

function req(path: string, cookie?: string) {
  return new NextRequest(new URL(path, "http://localhost:3100"), cookie ? { headers: { cookie } } : undefined);
}

afterEach(() => vi.unstubAllEnvs());

describe("proxy (http mode)", () => {
  it("lets a signed-in user through with the secure refresh cookie", async () => {
    const proxy = await loadProxy("http");
    expect(proxy(req("/bugun", "__Host-kaptan_rt=x")).headers.get("location")).toBeNull();
  });

  it("accepts the plain-http refresh cookie the API sets when COOKIE_SECURE=false", async () => {
    const proxy = await loadProxy("http");
    expect(proxy(req("/bugun", "kaptan_rt=x")).headers.get("location")).toBeNull();
  });

  it("sends a signed-out user to /login with the path carried in ?next=", async () => {
    const proxy = await loadProxy("http");
    expect(proxy(req("/portfoy")).headers.get("location")).toBe("http://localhost:3100/login?next=%2Fportfoy");
  });

  it("never needs a session for the landing", async () => {
    const proxy = await loadProxy("http");
    expect(proxy(req("/")).headers.get("location")).toBeNull();
  });
});
