/**
 * API mode switch. `mock` is the default and needs no env (Vercel preview works as-is);
 * `http` targets FastAPI /api/v1 through the rewrite in next.config.ts.
 */
export type ApiMode = "mock" | "http";

export const API_MODE: ApiMode = process.env.NEXT_PUBLIC_API_MODE === "http" ? "http" : "mock";

export const IS_MOCK = API_MODE === "mock";

/** Demo mode (FR-40): on in mock; in http mode the backend's DEMO_MODE decides. */
export const DEMO_MODE = IS_MOCK || process.env.NEXT_PUBLIC_DEMO_MODE === "true";
