import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";

/**
 * Screen tests render whole flows (dialogs, SSE, chart layout) in jsdom; one jsdom per file
 * costs ~0.7 s to boot. Half the cores keeps `npm run check` stable when the machine is also
 * building or running a dev server; 15 s per test is a ceiling for a loaded CI box, not a
 * crutch — the slowest flow takes ~2 s on an idle machine (userEvent runs with delay: null).
 */
const WORKERS = Math.max(2, Math.floor(availableParallelism() / 2));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    maxWorkers: WORKERS,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/mocks/**", "src/components/**"],
      // The http client needs the real API (covered when the backend exists).
      exclude: ["**/*.test.*", "src/lib/api/http/**"],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
