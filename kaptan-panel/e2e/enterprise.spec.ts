import { expect, test } from "@playwright/test";
import { go, login, openSettings, pickRole, trackErrors } from "./helpers";

/**
 * The enterprise layer end to end, in one tab (the mock desk lives in it): Analist sees a
 * proposal but cannot sign → Risk Sorumlusu signs → the ledger shows it → tamper → verify shows
 * the break → Yönetici proposes a limit → Risk approves → stop → Yönetici starts the restart →
 * Risk confirms.
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

test("roles, two signatures, the ledger, limits and the two-person restart", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  await login(page);
  await expect(page.getByRole("button", { name: /^Rol: Risk Sorumlusu\./ })).toBeVisible();

  // Yönetici adds the E3 scenario.
  await pickRole(page, "Yönetici");
  await openSettings(page);
  await page.getByRole("button", { name: "Senaryo ekle: Yeni iş" }).click();
  await page.getByRole("link", { name: "Bugün’e git →" }).click();
  const card = page.getByRole("article", { name: "ÖRNEK ENERJİ" });
  await expect(card).toBeVisible({ timeout: 20_000 });

  // Analist reads it, cannot sign, leaves a note.
  await pickRole(page, "Analist");
  await card.getByRole("link", { name: /^İncele/ }).click();
  await expect(page).toHaveURL(/\/oneri\/prop-demo-e3-ornek$/);
  await expect(page.getByRole("button", { name: "Onayla", exact: true })).toBeDisabled();
  await expect(page.getByTestId("denied-proposal.decide")).toContainText("Bunu Risk Sorumlusu yapar.");
  await expect(page.getByTestId("human-signature")).toContainText("Bekliyor: 2. imza — Risk Sorumlusu");
  await page.getByPlaceholder("Kısa bir not…").fill("Sözleşme bağlayıcı; şüpheci notu makul.");
  await page.getByRole("button", { name: "Not ekle" }).click();
  await expect(page.getByRole("list", { name: "Öneri notları" })).toContainText("Üye 2 · Analist");

  // Risk Sorumlusu signs.
  await page.getByRole("button", { name: "Risk Sorumlusu gözüyle bak →" }).click();
  await expect(page.getByRole("button", { name: "Onayla", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Onayla", exact: true }).click();
  await expect(page.getByTestId("human-signature")).toContainText(/Tamamlandı: 2\. imza — Risk Sorumlusu.*Üye 3/);
  await expect(page.getByRole("group", { name: /^Emir fişi/ })).toBeVisible({ timeout: 10_000 });

  // The ledger shows it and verifies.
  await go(page, "Denetim", /\/denetim$/);
  await expect(page.getByRole("list", { name: "Denetim kayıtları" })).toContainText("Risk Sorumlusu Örnek Enerji önerisini imzaladı.");
  await page.getByRole("button", { name: "Defteri doğrula" }).click();
  await expect(page.getByTestId("walk-result").getByText("Zincir sağlam.", { exact: true })).toBeVisible({ timeout: 15_000 });

  // Yönetici tampers; the walk stops at #3.907.
  await pickRole(page, "Yönetici");
  await openSettings(page);
  await page.getByTestId("tamper").getByRole("button", { name: "Bir kaydı kurcala" }).click();
  await expect(page.getByTestId("tamper")).toContainText("Şu an: kayıt değişik");
  await go(page, "Denetim", /\/denetim$/);
  await page.getByRole("button", { name: "Defteri doğrula" }).click();
  await expect(page.getByTestId("walk-result")).toContainText("Kayıt #3.907’de zincir kırık.", { timeout: 15_000 });
  // The verdict shows the broken record and takes you to it in the ledger.
  await page.getByRole("button", { name: "Defterde göster →" }).click();
  await expect(page.locator("#kayit-3907")).toBeFocused();
  await openSettings(page);
  await page.getByTestId("tamper").getByRole("button", { name: "Kurcalamayı geri al" }).click();
  await expect(page.getByTestId("tamper")).toContainText("Şu an: defter temiz");

  // Yönetici proposes a tighter limit (1/2); Risk Sorumlusu approves (2/2).
  await page.getByRole("button", { name: "Değişiklik öner" }).click();
  const form = page.getByRole("form", { name: "Sınır değişikliği öner" });
  await form.getByRole("textbox", { name: /Yeni değer/ }).fill("0,4");
  await form.getByRole("textbox", { name: /Neden/ }).fill("Oynaklık arttı, işlem başına riski azaltalım.");
  await form.getByRole("button", { name: "Öner (1/2)" }).click();
  await expect(page.getByTestId("limit-pending")).toContainText("1/2 imza");
  await expect(page.getByRole("button", { name: "Onayla (2/2)" })).toBeDisabled();
  await pickRole(page, "Risk Sorumlusu");
  await page.getByRole("button", { name: "Onayla (2/2)" }).click();
  await expect(page.getByRole("list", { name: "Geçerli sınırlar" })).toContainText("Bir işlemde en fazla sermayenin %0,4’ü riske girer.");

  // Stop (Risk Sorumlusu) → Yönetici starts the restart (1/2) → Risk Sorumlusu confirms (2/2).
  await go(page, "Portföy", /\/portfoy$/);
  await page.getByRole("button", { name: "Durdur", exact: true }).click();
  const stop = page.getByRole("dialog", { name: "Her şeyi durdur" });
  await stop.getByRole("textbox").fill("Piyasa çok oynak, ara veriyoruz.");
  await stop.getByRole("button", { name: "Durdur" }).click();
  await expect(page.getByTestId("stop-state")).toContainText("Yönetici başlatır, Risk Sorumlusu onaylar.");
  await expect(page.getByRole("button", { name: "Yeniden başlatmayı başlat" })).toBeDisabled();

  await pickRole(page, "Yönetici");
  await page.getByRole("button", { name: "Yeniden başlatmayı başlat" }).click();
  const start = page.getByRole("dialog", { name: "Yeniden başlatmayı başlat" });
  await start.getByRole("textbox").fill("Olay incelendi, eşikler doğru çalıştı.");
  await start.getByRole("button", { name: "Başlat (1/2)" }).click();
  await expect(page.getByTestId("reset-stamp-1")).toContainText("Üye 1 · Yönetici");
  await expect(page.getByRole("button", { name: "Onayla ve yeniden başlat" })).toBeDisabled();

  await pickRole(page, "Risk Sorumlusu");
  await page.getByRole("button", { name: "Onayla ve yeniden başlat" }).click();
  const confirm = page.getByRole("dialog", { name: "Onayla ve yeniden başlat" });
  await confirm.getByRole("textbox").fill("İkinci imza: inceledim, onaylıyorum.");
  await confirm.getByRole("button", { name: "Onayla (2/2)" }).click();
  await expect(page.getByRole("button", { name: "Durdur", exact: true })).toBeVisible();
  await expect(page.getByTestId("stop-state")).toHaveCount(0);

  // The ledger kept every step.
  await go(page, "Denetim", /\/denetim$/);
  const ledger = page.getByRole("list", { name: "Denetim kayıtları" });
  await expect(ledger).toContainText("Risk Sorumlusu yeniden başlatmayı onayladı (2/2).");
  await expect(ledger).toContainText("Yönetici yeniden başlatmayı başlattı (1/2).");
  await expect(ledger).toContainText("Risk Sorumlusu sınır değişikliğini onayladı (2/2).");

  expect(errors).toEqual([]);
});

test("the role survives a reload, and the Denetçi can change nothing", async ({ page }) => {
  await login(page);
  await pickRole(page, "Denetçi");
  await page.reload();
  await expect(page.getByRole("button", { name: /^Rol: Denetçi\./ })).toBeVisible();
  await page.goto("/oneri/prop-day-e1-krgcl");
  await expect(page.getByRole("button", { name: "Onayla", exact: true })).toBeDisabled();
  await expect(page.getByTestId("denied-proposal.decide")).toContainText("Denetçi yalnızca bakar.");
  await page.goto("/portfoy");
  await expect(page.getByRole("button", { name: "Durdur", exact: true })).toBeDisabled();
});
