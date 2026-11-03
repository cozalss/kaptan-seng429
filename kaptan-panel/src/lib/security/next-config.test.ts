// @vitest-environment node
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";

/** next.config.ts reads the test flag at import, so each case imports a fresh copy. */
async function load(env: { testDouble?: boolean; origin?: string }) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_KAPTAN_TEST_DOUBLE", env.testDouble ? "1" : "");
  vi.stubEnv("KAPTAN_API_ORIGIN", env.origin ?? "");
  return (await import("../../../next.config")).default;
}

const apiRewrites = async (config: NextConfig) => ((await config.rewrites?.()) as unknown as { afterFiles: Array<{ destination: string }> }).afterFiles;

afterEach(() => vi.unstubAllEnvs());

describe("next.config: the mock can never reach production", () => {
  it.each([PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER])("refuses %s with the test flag", async (phase) => {
    const config = await load({ testDouble: true, origin: "http://api:8000" });
    expect(() => config(phase)).toThrow(/tests under `next dev` only/);
  });

  it("swaps in the double only under the flag", async () => {
    const real = (await load({}))(PHASE_DEVELOPMENT_SERVER);
    expect(real.turbopack).toBeUndefined();
    expect(real.pageExtensions).toBeUndefined();
    const double = (await load({ testDouble: true }))(PHASE_DEVELOPMENT_SERVER);
    expect(double.turbopack?.resolveAlias?.["@/lib/api/client"]).toBe("./src/lib/api/client.mock.ts");
    expect(double.pageExtensions).toContain("mock.ts");
    expect(await apiRewrites(double)).toEqual([]);
  });

  it("ignores the old mode switch: mock is never asked for by that name", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "mock");
    const config = (await load({ origin: "http://api:8000" }))(PHASE_PRODUCTION_BUILD);
    expect(config.turbopack).toBeUndefined();
    expect(await apiRewrites(config)).toEqual([{ source: "/api/v1/:path*", destination: "http://api:8000/api/v1/:path*" }]);
  });
});

describe("next.config: which build this is", () => {
  it("builds the public website only when no API origin is set, as on Vercel", async () => {
    for (const origin of ["", "   "]) {
      const config = (await load({ origin }))(PHASE_PRODUCTION_BUILD);
      expect(config.env?.NEXT_PUBLIC_KAPTAN_SITE_ONLY).toBe("1");
      expect(await apiRewrites(config)).toEqual([]);
    }
  });

  it("builds the real panel with an API origin", async () => {
    const config = (await load({ origin: "http://api:8000/" }))(PHASE_PRODUCTION_BUILD);
    expect(config.env?.NEXT_PUBLIC_KAPTAN_SITE_ONLY).toBe("0");
    expect(await apiRewrites(config)).toEqual([{ source: "/api/v1/:path*", destination: "http://api:8000/api/v1/:path*" }]);
  });

  it("uses the local API in next dev", async () => {
    const config = (await load({}))(PHASE_DEVELOPMENT_SERVER);
    expect(config.env?.NEXT_PUBLIC_KAPTAN_SITE_ONLY).toBe("0");
    expect((await apiRewrites(config))[0]?.destination).toBe("http://127.0.0.1:8000/api/v1/:path*");
  });

  it("stops the build on an origin that is not a URL", async () => {
    const bad = await load({ origin: "nonsense" });
    expect(() => bad(PHASE_PRODUCTION_BUILD)).toThrow(/KAPTAN_API_ORIGIN/);
  });

  it("puts a CSP on the landing and the common headers on everything", async () => {
    const headers = await (await load({ origin: "http://api:8000" }))(PHASE_PRODUCTION_BUILD).headers?.();
    const of = (source: string) => headers?.find((h) => h.source === source)?.headers.map((h) => h.key) ?? [];
    expect(of("/")).toEqual(["Content-Security-Policy"]);
    expect(of("/:path*")).toEqual(expect.arrayContaining(["X-Frame-Options", "Referrer-Policy", "X-Content-Type-Options", "Permissions-Policy", "Cross-Origin-Opener-Policy"]));
  });
});
