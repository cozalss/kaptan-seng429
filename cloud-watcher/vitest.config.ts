import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/index.ts",
      miniflare: {
        compatibilityDate: "2026-11-01",
        d1Databases: ["DB"],
        bindings: {
          CLOUD_SYNC_SECRET: "sync-secret-for-tests",
          WEBHOOK_SECRET: "hook-secret-for-tests",
          TELEGRAM_BOT_TOKEN: "123456:TESTTOKENTESTTOKENTESTTOKENTESTTOKEN",
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
});
