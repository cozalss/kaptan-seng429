import { expect, type Page } from "@playwright/test";
import { IS_API } from "./backend";

/** The mock deployment's passphrase (shown as a small hint on /login on purpose). */
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

export type RoleLabel = "Analist" | "Risk Sorumlusu" | "Yönetici" | "Denetçi";

/** The account picker on /login: a radio group named "Hesap"; each radio reads "<rol> <kişi>". */
export function accountRadio(page: Page, label: RoleLabel) {
  return page.getByRole("radiogroup", { name: "Hesap" }).getByRole("radio", { name: new RegExp(`^${label} `) });
}

/**
 * Sign in on /login (Risk Sorumlusu's account by default): pick the account, type the
 * passphrase, "Giriş yap". Lands on Bugün.
 */
export async function login(page: Page, label: RoleLabel = "Risk Sorumlusu") {
  await page.goto("/login");
  await accountRadio(page, label).check();
  await page.getByLabel("Parola").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page).toHaveURL(/\/bugun$/);
}

/**
 * Sign in without the form (sets the session cookie on the page's context): the mock session
 * route, or in http mode POST /api/v1/auth/login through the Next rewrite (the refresh cookie
 * lands on the panel's origin, as for a browser).
 */
export async function loginApi(page: Page) {
  const r = IS_API
    ? await page.request.post("/api/v1/auth/login", { data: { passphrase: PASSPHRASE } })
    : await page.request.post("/api/mock/session", { data: { passphrase: PASSPHRASE } });
  expect(r.ok()).toBe(true);
}

/** Navigate with the top bar (client-side, so the in-tab mock desk and its timers keep running). */
export async function go(page: Page, label: "Bugün" | "Portföy" | "Denetim", url: RegExp) {
  await page.getByRole("navigation", { name: "Ana gezinme" }).getByRole("link", { name: label }).click();
  await expect(page).toHaveURL(url);
}

/**
 * The top bar's account menu trigger. Its accessible name starts with "Rol: <rol>." (kept
 * from the old role chip, so `^Rol: Denetçi\.` assertions still hold).
 */
export function accountMenu(page: Page) {
  return page.getByRole("button", { name: /^Rol: / });
}

/** Open Ayarlar from the account menu (client-side). */
export async function openSettings(page: Page) {
  await accountMenu(page).click();
  await page.getByRole("menuitem", { name: "Ayarlar" }).click();
  await expect(page).toHaveURL(/\/ayarlar$/);
}

/** Switch to another team account with the account menu's "Hesap değiştir" (kept in the session). */
export async function pickRole(page: Page, label: RoleLabel) {
  await accountMenu(page).click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${label} ·`) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Rol: ${label}\\.`) })).toBeVisible();
  // Let the menu finish closing: a click on the trigger during its exit animation is swallowed
  // (seen in http mode, where the switch answers while the menu is still closing).
  await expect(page.getByRole("menu")).toHaveCount(0);
}
