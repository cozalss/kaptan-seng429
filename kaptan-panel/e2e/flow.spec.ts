import { expect, test } from "@playwright/test";
import { resetBackendDemo } from "./backend";
import { login, openSettings, pickRole, trackErrors } from "./helpers";

/**
 * The simple core in one tab (the mock desk lives in it; navigation stays client-side):
 * Yönetici injects E3 → the card arrives on Bugün → Risk Sorumlusu: İncele → summary → Onayla → emir fişi
 * → Girdim → it is in Portföy. (Stop and the two-person restart: enterprise.spec.ts.)
 */
test.beforeEach(async ({ page }) => {
  await resetBackendDemo(); // http mode: a fresh demo day, as clearing localStorage gives the mock
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
  await page.getByRole("tab", { name: "Senaryolar" }).click();
  await page.getByRole("button", { name: /^Senaryo ekle: Yeni iş/ }).click();
  await expect(page.getByText(/Eklendi\. Öneri birkaç saniye içinde/)).toBeVisible();
  await page.getByRole("link", { name: "Bugün’e git →" }).click();
  const card = page.getByRole("article", { name: "ÖRNEK ENERJİ" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Yıllık gelirinin %18’i kadar yeni iş aldı.");

  // The proposal first, the decision right under it; the story waits behind its sections.
  await pickRole(page, "Risk Sorumlusu");
  await card.getByRole("link", { name: /^İncele/ }).click();
  await expect(page).toHaveURL(/\/oneri\/prop-demo-e3-ornek$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Yıllık gelirinin %18’i kadar yeni iş aldı.");
  await expect(page.getByRole("region", { name: "Öneri" })).toContainText(/\d+ lot al · limit /);
  await expect(page.getByText("Benzer 23 olayın 14’ünde hisse 5 gün içinde yükseldi.")).toBeVisible();
  await expect(page.getByText(/^8 üye çalıştı; 2’si tutarı değiştirdi: Şüpheci yarıya indirdi, Risk Kapısı .* ile sınırladı\.$/)).toBeVisible();
  await page.getByRole("button", { name: "Tayfa ne dedi?", exact: true }).click();
  await expect(page.getByRole("list", { name: "Tayfanın notları" }).getByText(/Tutarı yarıya indirdi\./)).toBeVisible();
  await expect(page.getByTestId("human-signature")).toContainText("Bekliyor: 2. imza — Risk Sorumlusu");
  await page.getByRole("button", { name: "Onayla", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^İmzalandı · \d\d:\d\d$/ })).toBeFocused();

  // Emir fişi → Girdim.
  const slip = page.getByRole("group", { name: /^Emir fişi/ });
  await expect(slip).toBeVisible({ timeout: 10_000 });
  await expect(slip).toContainText("ORNEK");
  await expect(slip.getByRole("button", { name: "Kopyala" })).toBeEnabled();
  await slip.getByRole("button", { name: "Girdim" }).click();
  await slip.getByRole("button", { name: "Kaydet" }).click();
  await expect(slip.getByText(/Girildi · 620 lot/)).toBeVisible();

  // It is in Portföy: a row of the holdings table, 620 lot, linked back to the proposal.
  await slip.getByRole("link", { name: "Portföyünde →" }).click();
  await expect(page).toHaveURL(/\/portfoy$/);
  const row = page.getByRole("table", { name: "Elindekiler" }).getByRole("row").filter({ hasText: /Örnek Enerji|ÖRNEK ENERJİ/ }).filter({ hasText: "620" });
  await expect(row.first()).toBeVisible();
  await expect(row.first().getByRole("link")).toHaveAttribute("href", "/oneri/prop-demo-e3-ornek");

  expect(errors).toEqual([]);
});
