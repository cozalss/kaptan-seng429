import { expect, test } from "@playwright/test";
import { login, openSettings, pickRole, trackErrors } from "./helpers";

/**
 * The simple core in one tab (the mock desk lives in it; navigation stays client-side):
 * Yönetici injects E3 → the card arrives on Bugün → Risk Sorumlusu: İncele → Onayla → emir fişi
 * → Girdim → it is in Portföy. (Stop and the two-person restart: enterprise.spec.ts.)
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());
});

test("E3 → Onayla → Girdim → Portföy", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page);

  // The Yönetici injects E3 from Ayarlar, then watch it arrive on Bugün.
  await pickRole(page, "Yönetici");
  await openSettings(page);
  await page.getByRole("button", { name: "Senaryo ekle: Yeni iş (E3)" }).click();
  await expect(page.getByText(/Eklendi\. Öneri birkaç saniye içinde/)).toBeVisible();
  await page.getByRole("link", { name: "Bugün’e git →" }).click();
  const card = page.getByRole("article", { name: "ÖRNEK ENERJİ" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Yıllık gelirinin %18’i kadar yeni iş aldı.");

  // The story, then the one decision — the Risk Sorumlusu's.
  await pickRole(page, "Risk Sorumlusu");
  await card.getByRole("link", { name: /^İncele/ }).click();
  await expect(page).toHaveURL(/\/oneri\/prop-demo-e3-ornek$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Yıllık gelirinin %18’i kadar yeni iş aldı.");
  await expect(page.getByText(/Benzer 23 olayın %61’inde hisse 5 gün içinde yükseldi/)).toBeVisible();
  await expect(page.getByText(/Tutarı yarıya indirdi\./)).toBeVisible();
  await page.getByRole("button", { name: "Onayla", exact: true }).click();

  // Emir fişi → Girdim.
  const slip = page.getByRole("group", { name: /^Emir fişi/ });
  await expect(slip).toBeVisible({ timeout: 10_000 });
  await expect(slip).toContainText("ORNEK");
  await slip.getByRole("button", { name: "Girdim" }).click();
  await slip.getByRole("button", { name: "Kaydet" }).click();
  await expect(slip.getByText(/Girildi · 620 lot/)).toBeVisible();

  // It is in Portföy, in your own account.
  await slip.getByRole("link", { name: "Portföyünde →" }).click();
  await expect(page).toHaveURL(/\/portfoy$/);
  const mine = page.getByRole("list", { name: "Elindekiler" }).getByRole("listitem").filter({ hasText: "hesabında" });
  await expect(mine.filter({ hasText: "ÖRNEK ENERJİ" })).toBeVisible();

  expect(errors).toEqual([]);
});
