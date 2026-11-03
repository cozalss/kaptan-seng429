import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { LEGACY_REDIRECTS } from "./src/lib/nav";
import { LANDING_CSP } from "./src/lib/security/csp";

/**
 * KAPtan: the landing at "/" and the panel beside it, on the FastAPI service. /api/v1/* is rewritten
 * to it so the refresh cookie (__Host-kaptan_rt) stays first-party (FRONTEND-SPEC.md §9 Ç-16).
 *
 * Three builds, chosen explicitly:
 *  - KAPTAN_API_ORIGIN set: the real panel. `next dev` falls back to the local API.
 *  - KAPTAN_API_ORIGIN unset or empty at `next build` (Vercel): the public website only; "/" is the
 *    landing, every other path is one honest page (src/proxy.ts). There is no API to fake.
 *  - NEXT_PUBLIC_KAPTAN_TEST_DOUBLE=1: the in-browser mock, for vitest and playwright only. It runs
 *    under `next dev` and nothing else: building or serving production with it stops here.
 */
const TEST_DOUBLE = process.env.NEXT_PUBLIC_KAPTAN_TEST_DOUBLE === "1";
const LOCAL_API_ORIGIN = "http://127.0.0.1:8000";

function apiOrigin(phase: string): string {
  const origin = (process.env.KAPTAN_API_ORIGIN ?? "").trim();
  if (!origin) return phase === PHASE_DEVELOPMENT_SERVER ? LOCAL_API_ORIGIN : "";
  if (!URL.canParse(origin)) throw new Error(`KAPTAN_API_ORIGIN must be a full URL, got "${origin}".`);
  return origin.replace(/\/+$/, "");
}

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

export default function config(phase: string): NextConfig {
  if (TEST_DOUBLE && phase !== PHASE_DEVELOPMENT_SERVER) {
    throw new Error("NEXT_PUBLIC_KAPTAN_TEST_DOUBLE is for tests under `next dev` only; a production build or server never runs on the mock.");
  }
  const origin = TEST_DOUBLE ? "" : apiOrigin(phase);
  const siteOnly = !TEST_DOUBLE && origin === "";
  if (siteOnly && phase === PHASE_PRODUCTION_BUILD) console.info("[kaptan] KAPTAN_API_ORIGIN is empty: building the public website only (the landing and one honest page, no panel).");
  return {
    reactStrictMode: true,
    // A second dev server builds into its own folder.
    ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
    poweredByHeader: false,
    devIndicators: false,
    env: { NEXT_PUBLIC_KAPTAN_SITE_ONLY: siteOnly ? "1" : "0" },
    // The test double's session route (route.mock.ts) and client exist only under the test flag;
    // a real build has neither in its graph (src/lib/api/client.ts is the http client).
    ...(TEST_DOUBLE
      ? {
          pageExtensions: ["mock.ts", "tsx", "ts"],
          turbopack: { resolveAlias: { "@/lib/api/client": "./src/lib/api/client.mock.ts" } },
        }
      : {}),
    async headers() {
      return [
        { source: "/:path*", headers: SECURITY_HEADERS },
        // The app's pages get a per-request nonce policy from src/proxy.ts; the landing is a static file.
        { source: "/", headers: [{ key: "Content-Security-Policy", value: LANDING_CSP }] },
        { source: "/index.html", headers: [{ key: "Content-Security-Policy", value: LANDING_CSP }] },
        // The landing's hashed Vite bundles never change under the same name.
        { source: "/assets/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      ];
    },
    async redirects() {
      // Every older path (/bugun, /denetim, /login/<rol>, /inbox …) goes to the closest screen.
      return LEGACY_REDIRECTS.map((r) => ({ ...r, permanent: false }));
    },
    async rewrites() {
      // "/" is the public landing page, built from ../kaptan-landing into public/ (scripts/sync-landing.mjs).
      const beforeFiles = [{ source: "/", destination: "/index.html" }];
      const afterFiles = origin ? [{ source: "/api/v1/:path*", destination: `${origin}/api/v1/:path*` }] : [];
      return { beforeFiles, afterFiles, fallback: [] };
    },
  };
}
