import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { accountRadio, login, PASSPHRASE, showSidebar, trackErrors } from "./helpers";

/**
 * "Kişisel moda geç" on the four-role desk: any signed-in member opens the personal home
 * (/benim) on the same desk with their own rights, the choice is remembered for the next
 * sign-in, and "Gelişmiş görünüm" goes back.
 */
test("multi-user desk → Kişisel moda geç → /benim (role rights) → remembered → back", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "Denetçi");
  await showSidebar(page);
  await page.getByTestId("kisisel-mod").click();
  await expect(page).toHaveURL(/\/benim$/);
  await expect(page.getByRole("heading", { name: "Paran şu an" })).toBeVisible();

  // The Denetçi looks, signs nothing: the reason is said once, the buttons are closed.
  const list = page.getByRole("region", { name: "Öneriler" });
  await expect(list.getByText(/Denetçi yalnızca bakar/)).toBeVisible();
  await expect(list.getByText(/İkinci imza gerekir/).first()).toBeVisible();
  await expect(list.getByRole("button", { name: /^Onayla: / }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Tüm işlemleri durdur" })).toBeDisabled();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

  // Sign out and back in: the remembered view opens.
  await page.getByRole("navigation", { name: "Hesap" }).getByRole("button", { name: "Çıkış" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/login");
  await accountRadio(page, "Risk Sorumlusu").check();
  await page.getByLabel("Parola").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page).toHaveURL(/\/benim$/);

  // The Risk Sorumlusu signs the second signature from here.
  await expect(page.getByText(/İkinci imza gerekir: onaylarsan senin adınla atılır/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Onayla: AL / }).first()).toBeEnabled();

  // Role routes are never rerouted by the remembered view.
  await page.goto("/portfoy");
  await expect(page).toHaveURL(/\/portfoy$/);
  await page.goto("/benim");
  await page.getByRole("navigation", { name: "Hesap" }).getByRole("link", { name: "Gelişmiş görünüm" }).click();
  await expect(page).toHaveURL(/\/bugun$/);
  expect(errors).toEqual([]);
});
