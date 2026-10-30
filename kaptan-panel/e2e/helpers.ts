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

/**
 * Under 1024px the sidebar is a drawer behind "Menüyü aç": open it when its navigation is not
 * on screen (from 1024px it is always there and this does nothing).
 */
export async function showSidebar(page: Page) {
  const menu = page.getByRole("button", { name: "Menüyü aç" });
  if (!(await menu.isVisible())) return; // 1024px and up: the sidebar is always there
  if ((await menu.getAttribute("aria-expanded")) !== "true") await menu.click();
  await expect(page.getByRole("navigation", { name: "Ana gezinme" })).toBeVisible();
}

/** Navigate with the sidebar (client-side, so the in-tab mock desk and its timers keep running). */
export async function go(page: Page, label: "Bugün" | "Portföy" | "Denetim", url: RegExp) {
  await showSidebar(page);
  await page.getByRole("navigation", { name: "Ana gezinme" }).getByRole("link", { name: new RegExp(`^${label}`) }).click();
  await expect(page).toHaveURL(url);
  await drawerSettled(page);
}

/** On a phone the drawer closes after a route change; wait until it has, so the next step sees the page. */
async function drawerSettled(page: Page) {
  const menu = page.getByRole("button", { name: "Menüyü aç" });
  if (await menu.isVisible()) await expect(menu).toHaveAttribute("aria-expanded", "false");
}

/**
 * The sidebar's account card (the menu trigger). Its accessible name starts with "Rol: <rol>."
 * (kept from the old role chip, so `^Rol: Denetçi\.` assertions still hold).
 */
export function accountMenu(page: Page) {
  return page.getByRole("button", { name: /^Rol: / });
}

/** Open Ayarlar from the account menu (client-side). */
export async function openSettings(page: Page) {
  await showSidebar(page);
  await accountMenu(page).click();
  await page.getByRole("menuitem", { name: "Ayarlar" }).click();
  await expect(page).toHaveURL(/\/ayarlar$/);
  await drawerSettled(page);
}

/** Switch to another team account with the account menu's "Hesap değiştir" (kept in the session). */
export async function pickRole(page: Page, label: RoleLabel) {
  await showSidebar(page);
  await accountMenu(page).click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${label} ·`) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Rol: ${label}\\.`) })).toBeVisible();
  // Let the menu finish closing: a click on the trigger during its exit animation is swallowed
  // (seen in http mode, where the switch answers while the menu is still closing).
  await expect(page.getByRole("menu")).toHaveCount(0);
}
