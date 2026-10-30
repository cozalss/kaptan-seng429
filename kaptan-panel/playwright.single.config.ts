import { defineConfig, devices } from "@playwright/test";

/**
 * The single-user flow ("Benim KAPtan'ım") on the mock panel: `npm run e2e:single`.
 * Its own dev server (NEXT_PUBLIC_SINGLE_USER=true) on its own port and build folder, so it
 * never collides with the four-role suite's server on 3100.
 */
const PORT = Number(process.env.E2E_SINGLE_PORT ?? 3150);
const BASE_URL = process.env.E2E_SINGLE_BASE_URL ?? `http://localhost:${PORT}`;
const CHANNEL = process.env.E2E_BROWSER_CHANNEL ?? "msedge";
const channel = CHANNEL === "chromium" ? undefined : CHANNEL;

export default defineConfig({
  testDir: "./e2e-single",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    channel,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "retain-on-failure",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Edge"], channel, viewport: { width: 1440, height: 900 } } }],
  webServer: process.env.E2E_SINGLE_BASE_URL
    ? undefined
    : {
        command: `npx next dev -p ${PORT}`,
        url: `${BASE_URL}/login`,
        reuseExistingServer: true,
        timeout: 180_000,
        env: { NEXT_PUBLIC_SINGLE_USER: "true", NEXT_DIST_DIR: ".next/solo" },
      },
});
