import { expect, test, type Locator } from "@playwright/test";
import { resetBackendDemo } from "./backend";
import { login, openSettings, trackErrors } from "./helpers";

/**
 * The guided tour walks all six acts with → and the bar's backups; roles switch by themselves.
 */
test.beforeEach(async ({ page }) => {
  await resetBackendDemo(); // http mode: a fresh demo day, as clearing localStorage gives the mock
  await page.goto("/login");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

const role = (bar: Locator, label: string) => expect(bar).toContainText(`Rol: ${label}`, { timeout: 15_000 });

test("Rehberli tur: 15 adım", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await login(page);
  await openSettings(page);
  await page.getByRole("tab", { name: "Rehberli tur" }).click();
  await page.getByRole("button", { name: "Turu başlat" }).click();
  const bar = page.getByTestId("guided-demo");
  const title = bar.getByTestId("demo-step-title");
  const next = async (expected: string) => {
    await page.keyboard.press("ArrowRight");
    await expect(title).toHaveText(expected);
  };

  // Perde 1 — Analist on Bugün.
  await expect(title).toHaveText("Bugün, Analist gözüyle");
  await expect(page).toHaveURL(/\/bugun$/);
  await role(bar, "Analist");

  // Perde 2 — E3 → Analist cannot sign → Risk Sorumlusu signs.
  await next("Yönetici sözleşme senaryosunu ekler");
  await role(bar, "Yönetici");
  await expect(page.getByRole("article", { name: "ÖRNEK ENERJİ" })).toBeVisible({ timeout: 20_000 });
  await next("Analist okur ama imzalayamaz");
  await expect(page).toHaveURL(/\/oneri\/prop-demo-e3-ornek$/, { timeout: 20_000 });
  await role(bar, "Analist");
  await expect(page.getByTestId("denied-proposal.decide")).toBeVisible();
  await next("Risk Sorumlusu imzalar (2/2)");
  await role(bar, "Risk Sorumlusu");
  await page.getByRole("button", { name: "Onayla", exact: true }).click();
  await expect(page.getByTestId("human-signature")).toContainText("Tamamlandı: 2. imza — Risk Sorumlusu");

  // Perde 3 — red-team and the restricted stock, seen in the ledger.
  await next("Gizli talimat yakalanır");
  await expect(page).toHaveURL(/\/denetim$/);
  await expect(page.getByRole("list", { name: "Denetim kayıtları" })).toContainText("gizli talimatı yakaladı", { timeout: 30_000 });
  await next("Tedbirli hisse baştan reddedilir");
  await expect(page.getByRole("list", { name: "Denetim kayıtları" })).toContainText("baştan reddetti", { timeout: 30_000 });

  // Perde 4 — loss → stop → two-person restart → ledger → limits.
  await next("Zarar: −%1’de durur, −%5’te her şey durur");
  await expect(page).toHaveURL(/\/portfoy$/);
  await expect(page.getByTestId("stop-state")).toBeVisible({ timeout: 20_000 });
  await next("Yönetici yeniden başlatmayı başlatır (1/2)");
  await role(bar, "Yönetici");
  await bar.getByRole("button", { name: "Yedek: başlat (1/2)" }).click();
  // The signed stamp, not the step's "Yönetici başlatır" label: against the API the backup answers
  // after a round trip, and moving on before it lands would send it under the next role.
  await expect(page.getByTestId("reset-stamp-1")).toContainText("İmzalandı: Üye 1 · Yönetici", { timeout: 15_000 });
  await next("Risk Sorumlusu onaylar (2/2)");
  await role(bar, "Risk Sorumlusu");
  await bar.getByRole("button", { name: "Yedek: onayla (2/2)" }).click();
  await expect(page.getByRole("button", { name: "Durdur", exact: true })).toBeVisible({ timeout: 10_000 });
  await next("Defter doğrulanır: zincir sağlam");
  await expect(page.getByTestId("walk-result").getByText("Zincir sağlam.", { exact: true })).toBeVisible({ timeout: 20_000 });
  await next("Kurcalama testi: zincir kırılır");
  await expect(page.getByTestId("walk-result")).toContainText("Kayıt #3.907’de zincir kırık.", { timeout: 20_000 });
  await next("Sınır değişikliği: Yönetici önerir (1/2)");
  await expect(page).toHaveURL(/\/ayarlar$/);
  await bar.getByRole("button", { name: "Yedek: öner (1/2)" }).click();
  await expect(page.getByTestId("limit-pending")).toBeVisible({ timeout: 10_000 });
  await next("Risk Sorumlusu onaylar (2/2)");
  await role(bar, "Risk Sorumlusu");
  await bar.getByRole("button", { name: "Yedek: onayla (2/2)" }).click();
  await expect(page.getByRole("list", { name: "Geçerli sınırlar" })).toContainText("%0,4’ü riske girer", { timeout: 10_000 });

  // Perde 5–6 — Denetçi, then the order ticket.
  await next("Denetçi gözüyle: sonuçlar");
  await role(bar, "Denetçi");
  await expect(page.getByRole("button", { name: "Durdur", exact: true })).toBeDisabled();
  await next("Emir fişi: son butona insan basar");
  await expect(page.getByRole("group", { name: /^Emir fişi/ })).toBeVisible({ timeout: 10_000 });

  // ← goes back one step; the last → finishes.
  await page.keyboard.press("ArrowLeft");
  await expect(title).toHaveText("Denetçi gözüyle: sonuçlar");
  await page.keyboard.press("ArrowRight");
  await bar.getByRole("button", { name: "Turu bitir" }).click();
  await expect(bar).toHaveCount(0);
  expect(errors).toEqual([]);
});
