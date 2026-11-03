import { defineConfig, devices } from "@playwright/test";

/**
 * Two modes, one suite:
 *  - `npm run e2e`     → the test double (NEXT_PUBLIC_KAPTAN_TEST_DOUBLE=1 under `next dev`), no
 *    backend. On its own port and build folder, so it never meets a real panel on 3100.
 *  - `npm run e2e:api` → the real panel (`npm run dev:api`) on the FastAPI backend (E2E_API=1, set by
 *    scripts/api-mode.mjs). The backend is started too unless one already answers on
 *    KAPTAN_API_ORIGIN; global-setup resets its day before the suite.
 */
const IS_API = process.env.E2E_API === "1";
const PORT = Number(process.env.E2E_PORT ?? (IS_API ? 3100 : 3199));
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
/** Local runs use Edge (msedge); CI sets E2E_BROWSER_CHANNEL=chromium for Playwright's bundled Chromium. */
const CHANNEL = process.env.E2E_BROWSER_CHANNEL ?? "msedge";
const channel = CHANNEL === "chromium" ? undefined : CHANNEL;
const API_ORIGIN = process.env.KAPTAN_API_ORIGIN ?? "http://127.0.0.1:8000";

const panelServer = {
  command: IS_API ? "npm run dev:api" : `npx next dev -p ${PORT}`,
  url: `${BASE_URL}/login`,
  reuseExistingServer: true,
  timeout: 180_000,
  env: (IS_API ? {} : { NEXT_PUBLIC_KAPTAN_TEST_DOUBLE: "1", NEXT_DIST_DIR: ".next/e2e" }) as Record<string, string>,
};

const backendServer = {
  command: "uv run python -m kaptan.api --port 8000",
  cwd: "../backend", // resolved against this config file's folder
  url: `${API_ORIGIN}/api/v1/health`,
  reuseExistingServer: true,
  timeout: 120_000,
  // The suite signs in ~60 times in 2-3 minutes from one address; the default 5/min login limit
  // (a real-world guard) would answer 429. Only this test backend raises it.
  env: { DEMO_MODE: "true", LLM_MODE: "replay", KAP_LIVE: "false", PRICES_LIVE: "false", LOGIN_RATE_PER_MINUTE: "600" },
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: IS_API ? "./e2e/global-setup.api.ts" : undefined,
  use: {
    baseURL: BASE_URL,
    channel,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], channel, viewport: { width: 1440, height: 900 } } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : IS_API ? [backendServer, panelServer] : panelServer,
});
