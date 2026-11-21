import { expect, test, type Page } from "@playwright/test";
import { go, loginApi, openSettings, seedMock, trackErrors } from "./helpers";

/** Fixing the book: change the starting money, take a movement back, start over, my bank's rate, the export. */

async function startedWith(page: Page, amount: string) {
  await seedMock(page, { fresh: true });
  await loginApi(page);
  await page.goto("/benim");
  await page.getByRole("textbox", { name: "Başlangıç paran" }).fill(amount);
  await page.getByRole("button", { name: "Bu parayla başla" }).click();
  await page.getByRole("button", { name: "Hayır, ana sayfaya geç" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Paran hazır/ })).toBeVisible();
  await go(page, "Param", /\/portfoy$/);
}

test.describe("fix what was typed wrong", () => {
  test("the starting money can be changed at any time and the old amount stays on the row", async ({ page }) => {
    const errors = trackErrors(page);
    await startedWith(page, "25000");
    const row = page.locator("[data-movement]").filter({ hasText: "ile başladın" });
    await row.getByRole("button", { name: /Başlangıç parasını değiştir/ }).click();
    const field = page.getByRole("textbox", { name: "Başlangıç paran ne kadardı?" });
    await field.fill("40000");
    await page.getByRole("button", { name: "Düzeltmeyi kaydet" }).click();
    await expect(page.locator(".om-status").first()).toContainText("Düzelttin");
    await expect(page.getByRole("heading", { name: /Şimdiye kadar 40\.000.₺ koydun/ })).toBeVisible();
    await expect(page.locator('[data-status="corrected"]')).toContainText("İlk yazdığın: 25.000");
    expect(errors).toEqual([]);
  });

  test("a deposit typed by mistake is taken back and stays in the list", async ({ page }) => {
    await startedWith(page, "10000");
    await page.getByRole("button", { name: "Para ekle" }).click();
    await page.getByRole("textbox", { name: "Ne kadar ekliyorsun?" }).fill("500");
    await page.getByRole("button", { name: "Parayı ekle" }).click();
    await expect(page.getByRole("heading", { name: /Şimdiye kadar 10\.500.₺ koydun/ })).toBeVisible();
    await page.locator("[data-movement]").filter({ hasText: "500" }).getByRole("button", { name: /Bunu yanlış girdim/ }).click();
    await page.getByRole("button", { name: "Evet, geri al" }).click();
    await expect(page.getByRole("heading", { name: /Şimdiye kadar 10\.000.₺ koydun/ })).toBeVisible();
    await expect(page.locator('[data-status="undone"]')).toContainText("Geri alındı.");
  });
});

test.describe("start over", () => {
  test("asks twice, keeps the old book in Geçmiş and returns to the first question", async ({ page }) => {
    const errors = trackErrors(page);
    await startedWith(page, "10000");
    await page.getByRole("button", { name: "Baştan başla" }).click();
    await expect(page.getByText("Eski defter silinmez")).toBeVisible();
    await page.getByRole("button", { name: "Devam et" }).click();
    await page.getByRole("textbox", { name: /Onaylamak için/ }).fill("yanlış");
    await page.getByRole("button", { name: "Defteri kapat ve baştan başla" }).click();
    await expect(page.getByText(/yazman gerekiyor/)).toBeVisible();
    await page.getByRole("textbox", { name: /Onaylamak için/ }).fill("BAŞTAN");
    await page.getByRole("button", { name: "Defteri kapat ve baştan başla" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ne kadar parayla başlıyorsun?" })).toBeVisible();

    await page.goto("/gecmis");
    await expect(page.getByRole("heading", { name: "Önceki defterlerin" })).toBeVisible();
    await page.getByText(/1\. defter/).click();
    await expect(page.getByText(/10\.000.₺ ile başladın/).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("my broker's rate and my records", () => {
  test("the rate is written once in Ayarlar and can be taken away", async ({ page }) => {
    await startedWith(page, "10000");
    await openSettings(page);
    await expect(page.getByRole("heading", { name: /KAPtan’ın hazır oranı geçerli/ })).toBeVisible();
    const field = page.getByRole("textbox", { name: "Binde kaç?" });
    await field.fill("50");
    await page.getByRole("button", { name: "Oranımı kaydet" }).click();
    await expect(page.getByText(/Binde 0 ile 10 arasında/)).toBeVisible();
    await field.fill("1,5");
    await page.getByRole("button", { name: "Oranımı kaydet" }).click();
    await expect(page.getByRole("heading", { name: /Komisyon oranın: binde 1,5/ })).toBeVisible();
    await page.getByRole("button", { name: "Kendi oranımı kaldır" }).click();
    await expect(page.getByRole("heading", { name: /KAPtan’ın hazır oranı geçerli/ })).toBeVisible();
  });

  test("Kayıtlarımı indir hands over a spreadsheet file", async ({ page }) => {
    await startedWith(page, "10000");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Kayıtlarımı indir" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^kayitlarim-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
