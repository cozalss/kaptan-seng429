import { expect, type Page } from "@playwright/test";

/** The mock deployment's demo passphrase (printed on /login on purpose). */
export const PASSPHRASE = "kaptan-demo";

/** Collect console errors and uncaught page errors for a "no console errors" assertion. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** Sign in through the login form; lands on Bugün (or ?next=). */
export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Parola").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Giriş", exact: true }).click();
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
export async function pickRole(page: Page, label: "Analist" | "Risk Sorumlusu" | "Yönetici" | "Denetçi") {
  await page.getByRole("button", { name: /Kimin gözüyle bakıyorsun\?/ }).click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${label} ·`) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Rol: ${label}\\.`) })).toBeVisible();
}
