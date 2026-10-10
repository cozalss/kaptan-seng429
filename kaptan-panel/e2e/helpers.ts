import { expect, type Page } from "@playwright/test";

/** The mock deployment's passphrase (printed on every door's screen on purpose). */
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

/** Sign in through a door on /login (Risk Sorumlusu by default); lands on Bugün. */
export async function login(page: Page, label: RoleLabel = "Risk Sorumlusu") {
  await page.goto("/login");
  await page.getByRole("list", { name: "Roller" }).getByRole("link", { name: label, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
  await page.getByLabel("Parola").fill(PASSPHRASE);
  await page.getByRole("button", { name: `${label} olarak gir` }).click();
  await expect(page).toHaveURL(/\/bugun$/);
}

/** Sign in without the form (sets the session cookie on the page's context). */
export async function loginApi(page: Page) {
  const r = await page.request.post("/api/mock/session", { data: { passphrase: PASSPHRASE } });
  expect(r.ok()).toBe(true);
}

/** Navigate with the top bar (client-side, so the in-tab mock desk and its timers keep running). */
export async function go(page: Page, label: "Bugün" | "Portföy" | "Denetim", url: RegExp) {
  await page.getByRole("navigation", { name: "Ana gezinme" }).getByRole("link", { name: label }).click();
  await expect(page).toHaveURL(url);
}

/** Open Ayarlar from the ⚙ menu (client-side). */
export async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Ayarlar ve çıkış" }).click();
  await page.getByRole("menuitem", { name: "Ayarlar" }).click();
  await expect(page).toHaveURL(/\/ayarlar$/);
}

/** Look through another role's eyes with the top-bar picker (client-side; the choice is kept in the session). */
export async function pickRole(page: Page, label: RoleLabel) {
  await page.getByRole("button", { name: /Kimin gözüyle bakıyorsun\?/ }).click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${label} ·`) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Rol: ${label}\\.`) })).toBeVisible();
}
