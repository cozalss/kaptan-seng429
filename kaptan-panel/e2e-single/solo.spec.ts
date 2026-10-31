import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Single-user mode, mock panel: one password → "Benim KAPtan'ım" → approve a suggestion → it
 * shows in "Son işlemler" → the emergency stop. Also: no console errors, no axe violations,
 * and the phone width fits without sideways scrolling.
 */
const PASSPHRASE = "kaptan2026";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());
  await expect(page.getByRole("heading", { name: "Benim KAPtan'ım" })).toBeVisible();
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
  await page.getByLabel("Parola").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page).toHaveURL(/\/benim$/);
  await expect(page.getByRole("heading", { name: "Paran şu an" })).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("login → home → approve → hold → Son işlemler → emergency stop → restart", async ({ page }) => {
  const errors = trackErrors(page);
  await signIn(page);

  await expect(page.getByTestId("toplam-para")).toContainText("₺");
  await expect(page.getByText("Kullanılabilir nakit")).toBeVisible();
  await expect(page.getByRole("region", { name: "Param nerede?" }).getByText("Nakit", { exact: true })).toBeVisible();
  const suggestions = page.getByRole("region", { name: "Öneriler" });
  await expect(suggestions.getByRole("heading", { name: /^AL — KRGCL/ })).toBeVisible();

  await page.getByRole("button", { name: "Onayla: AL KRGCL" }).click();
  await expect(page.getByRole("button", { name: "Onayla: AL KRGCL" })).toHaveCount(0);
  await expect(page.getByText("KRGCL alımını onayladın.")).toBeVisible();
  await expect(page.getByTestId("son-islemler")).toContainText(/KRGCL (alımını onayladın|aldın)/);

  // TUT: recorded by the API (suggestion.held), then hidden here and listed in Son işlemler.
  await suggestions.getByRole("button", { name: /^Tümünü gör/ }).click();
  await page.getByRole("button", { name: "Onayla: TUT FRZEN" }).click();
  await expect(page.getByRole("button", { name: "Onayla: TUT FRZEN" })).toHaveCount(0);
  await expect(page.getByTestId("son-islemler")).toContainText("FRZEN elinde kalıyor");

  await page.getByRole("button", { name: "Tüm işlemleri durdur" }).click();
  const dialog = page.getByRole("dialog", { name: "Tüm işlemler durdurulsun mu?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Evet, durdur" }).click();
  await expect(page.getByRole("heading", { name: "Tüm işlemler durduruldu" })).toBeVisible();
  await expect(page.getByText("İşlemler durduruldu; öneriler şimdilik onaylanamaz.")).toBeVisible();

  // The same person restarts (request + confirm in one go; single-user waiver).
  await page.getByRole("button", { name: "İşlemleri yeniden başlat" }).click();
  const restart = page.getByRole("dialog", { name: "İşlemler yeniden başlasın mı?" });
  await restart.getByRole("button", { name: "Evet, yeniden başlat" }).click();
  await expect(page.getByRole("heading", { name: "Acil durum" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Onayla: AL ORNCM" })).toBeEnabled();

  // The full desk is one link away.
  await page.getByRole("navigation", { name: "Hesap" }).getByRole("link", { name: "Gelişmiş görünüm" }).click();
  await expect(page).toHaveURL(/\/bugun$/);
  expect(errors).toEqual([]);
});

test("a signed-in visit to /login goes home; the screen passes axe and fits a phone", async ({ page }) => {
  await signIn(page);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/benim$/);
  await expect(page.getByRole("heading", { name: "Paran şu an" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

  await page.setViewportSize({ width: 360, height: 780 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Paran şu an" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("dark reading passes axe too", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});
