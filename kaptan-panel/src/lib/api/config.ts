/**
 * Every real build talks to FastAPI /api/v1 through the rewrite in next.config.ts. The in-browser
 * test double exists for vitest and playwright only: their configs set
 * NEXT_PUBLIC_KAPTAN_TEST_DOUBLE=1, and next.config.ts refuses to build or serve production with it.
 */
export type ApiMode = "mock" | "http";

export const API_MODE: ApiMode = process.env.NEXT_PUBLIC_KAPTAN_TEST_DOUBLE === "1" ? "mock" : "http";

/** The public website: built with no KAPTAN_API_ORIGIN, so "/" is the landing and nothing else opens. */
export const SITE_ONLY = process.env.NEXT_PUBLIC_KAPTAN_SITE_ONLY === "1";
