import { expect, test } from "@playwright/test";
import { go, login, openSettings, trackErrors } from "./helpers";

/**
 * The whole personal flow in one tab (the mock desk lives in it; navigation stays client-side):
 * inject E3 → the card arrives on Bugün → İncele → Onayla → emir fişi → Girdim → it is in
 * Portföy → Durdur → the reset wait → fast-forward → second confirmation → running again.
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());
});

test("E3 → Onayla → Girdim → Portföy → Durdur → wait → Yeniden başlat", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await login(page);

  // Inject E3 from Ayarlar, then watch it arrive on Bugün.
  await openSettings(page);
  await page.getByRole("button", { name: "Senaryo ekle: Yeni iş (E3)" }).click();
  await expect(page.getByText(/Eklendi\. Öneri birkaç saniye içinde/)).toBeVisible();
  await page.getByRole("link", { name: "Bugün’e git →" }).click();
  const card = page.getByRole("article", { name: "ÖRNEK ENERJİ" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Yıllık gelirinin %18’i kadar yeni iş aldı.");

  // The story, then the one decision.
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

  // Durdur with one written reason → the wait starts.
  await page.getByRole("button", { name: "Durdur", exact: true }).click();
  const stop = page.getByRole("dialog", { name: "Her şeyi durdur" });
  await stop.getByRole("textbox").fill("Piyasa çok oynak, bir hafta ara veriyorum.");
  await stop.getByRole("button", { name: "Durdur" }).click();
  await expect(stop).toBeHidden();
  await expect(page.getByTestId("stop-state")).toContainText("Yeniden başlatmak için 24 saat ve 5 seans beklemen gerekiyor.");
  await expect(page.getByRole("button", { name: "Yeniden başlat" })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Durduruldu." })).toBeVisible();

  // Fast-forward the reset clock in Ayarlar.
  await openSettings(page);
  const clock = page.getByTestId("reset-clock");
  await clock.getByRole("button", { name: "Beklemeyi doldur" }).click();
  await expect(clock).toContainText("Bekleme doldu");

  // Second confirmation → running again.
  await go(page, "Portföy", /\/portfoy$/);
  await page.getByRole("button", { name: "Yeniden başlat" }).click();
  const again = page.getByRole("dialog", { name: "Yeniden başlat" });
  await again.getByRole("textbox").fill("Bekleme doldu, kurallara dönüyorum.");
  await again.getByRole("button", { name: "Yeniden başlat" }).click();
  await expect(again).toBeHidden();
  await expect(page.getByRole("button", { name: "Durdur", exact: true })).toBeVisible();
  await expect(page.getByTestId("stop-state")).toHaveCount(0);

  expect(errors).toEqual([]);
});
