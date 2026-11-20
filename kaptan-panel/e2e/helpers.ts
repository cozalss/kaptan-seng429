import { expect, type Page } from "@playwright/test";
import { STATE_VERSION } from "../src/lib/api/mock/state";
import { IS_API } from "./backend";

/** The test double's passphrase; never shown anywhere. */
export const PASSPHRASE = "kaptan2026";

/** Collect console errors and uncaught page errors for a "no console errors" assertion. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** "KAPtan nasıl çalışır" has been seen: it opens by itself only on a first visit, tested on its own in screens.spec.ts. */
export async function skipFirstVisit(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("kaptan_howto_seen", "1"));
}

/** Sign in on /login: one password field, "Giriş yap". Lands on the home. */
export async function login(page: Page) {
  await skipFirstVisit(page);
  await page.goto("/login");
  await page.getByLabel("Parola").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page).toHaveURL(/\/benim$/);
}

/**
 * Sign in without the form (sets the session cookie on the page's context): the test double's
 * session route, or on the real panel POST /api/v1/auth/login through the Next rewrite (the refresh cookie
 * lands on the app's origin, as for a browser).
 */
export async function loginApi(page: Page) {
  await skipFirstVisit(page);
  const r = IS_API
    ? await page.request.post("/api/v1/auth/login", { data: { passphrase: PASSPHRASE } })
    : await page.request.post("/api/mock/session", { data: { passphrase: PASSPHRASE } });
  expect(r.ok()).toBe(true);
}

/** The top bar's navigation. */
export function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Ana gezinme" });
}

/** Navigate with the top bar (client-side, so the in-tab mock state and its timers keep running). */
export async function go(page: Page, label: "Ana sayfa" | "Param" | "Okunanlar" | "Geçmiş", url: RegExp) {
  await mainNav(page).getByRole("link", { name: label, exact: true }).click();
  await expect(page).toHaveURL(url);
}

/** Open Ayarlar from the account menu (client-side). */
export async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Hesabım" }).click();
  await page.getByRole("menuitem", { name: "Ayarlar" }).click();
  await expect(page).toHaveURL(/\/ayarlar$/);
}

/** What a browser test may put into the test double before the first load (status.ts, state.ts). */
export interface MockSeed {
  /** Problem codes the system reports, most important first. */
  problems?: string[];
  /** Disclosures that got no turn today, and the sentence the API gives for why. */
  deferred?: number;
  deferredReason?: string | null;
  /** Phone / e-mail channels set up on "this computer"; `failing`: the next test message fails. */
  alerts?: { ntfy?: boolean; email?: boolean; failing?: boolean };
  /** A new install with no starting money yet. */
  fresh?: boolean;
}

/** Start the test double in a chosen state (kept for the whole page, written once per context). */
export async function seedMock(page: Page, seed: MockSeed) {
  const { fresh, ...status } = seed;
  await page.addInitScript(
    ([stateKey, freshKey, slice, isFresh, version]) => {
      try {
        if (!window.localStorage.getItem(stateKey)) {
          window.localStorage.setItem(stateKey, JSON.stringify({ v: version, startedAtReal: Date.now(), status: slice }));
        }
        if (isFresh) window.localStorage.setItem(freshKey, "1");
      } catch {
        // Storage blocked: the double starts in its default state.
      }
    },
    ["kaptan-mock-state", "kaptan-mock-fresh", status, Boolean(fresh), STATE_VERSION] as const,
  );
}
