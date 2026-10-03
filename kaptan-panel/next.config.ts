import type { NextConfig } from "next";

/**
 * KAPtan Paneli. Mock mode (default) needs no env and no backend.
 * In http mode, /api/v1/* is rewritten to the FastAPI service so the refresh cookie
 * (__Host-kaptan_rt) stays first-party (FRONTEND-SPEC.md §9 Ç-16).
 */
const API_MODE = process.env.NEXT_PUBLIC_API_MODE === "http" ? "http" : "mock";
const API_ORIGIN = process.env.KAPTAN_API_ORIGIN ?? "http://127.0.0.1:8000";

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // The landing's hashed Vite bundles never change under the same name.
      { source: "/assets/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  async rewrites() {
    // "/" is the public landing page, built from ../kaptan-landing into public/ (scripts/sync-landing.mjs).
    const beforeFiles = [{ source: "/", destination: "/index.html" }];
    const afterFiles =
      API_MODE === "http" ? [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }] : [];
    return { beforeFiles, afterFiles, fallback: [] };
  },
};

export default nextConfig;
