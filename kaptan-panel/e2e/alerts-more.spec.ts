import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginApi, trackErrors } from "./helpers";

/** Price alerts, alert history, muted companies, the backup list and the weekly summary. */

async function settings(page: Page) {
  await loginApi(page);
  await page.goto("/ayarlar");
  await expect(page.getByRole("heading", { level: 2, name: /Fiyat uyarıları/ })).toBeVisible();
}

test("a price alert is made in Ayarlar, listed with the price now, and removed", async ({ page }) => {
  const errors = trackErrors(page);
  await settings(page);
  await expect(page.getByText("Bekleyen bir fiyat uyarın yok.")).toBeVisible();
  await page.getByLabel("Hangi hisse?").first().fill("ORNEK");
  await page.getByRole("radio", { name: "Şu fiyatın üstüne çıkarsa" }).check();
  await page.getByLabel("Fiyat (TL)").fill("10");
  await page.getByRole("button", { name: "Uyarı kur" }).click();
  await expect(page.getByText("Hisse bu fiyata şimdiden gelmiş.")).toBeVisible();
  await page.getByLabel("Fiyat (TL)").fill("90");
  await page.getByRole("button", { name: "Uyarı kur" }).click();
  await expect(page.getByRole("list", { name: "Fiyat uyarıların" })).toContainText("ORNEK");
  await expect(page.getByText("1 fiyat uyarın bekliyor.")).toBeVisible();
  await page.getByRole("button", { name: "ORNEK uyarısını kaldır" }).click();
  await expect(page.getByText("Bekleyen bir fiyat uyarın yok.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Fiyat uyarıların" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the company page has a price alert button that makes one for that share", async ({ page }) => {
  await loginApi(page);
  await page.goto("/hisse/ORNYZ");
  await page.getByRole("button", { name: "Fiyat uyarısı" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Yüzde 10 düşerse" }).check();
  await dialog.getByRole("button", { name: "Uyarı kur" }).click();
  await expect(dialog.getByText(/Uyarı kuruldu/)).toBeVisible();
  await dialog.getByRole("button", { name: "Tamam" }).click();
  await page.goto("/ayarlar");
  await expect(page.getByRole("list", { name: "Fiyat uyarıların" })).toContainText("Yüzde 10 düşerse");
});

test("a muted company is saved at once and still muted after a reload", async ({ page }) => {
  await settings(page);
  await page.getByLabel("Hangi şirket?").fill("ORNCM");
  await expect(page.getByRole("button", { name: "Sustur", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Sustur", exact: true }).click();
  await expect(page.getByRole("list", { name: "Susturduğun şirketler" })).toContainText("ORNCM");
  await page.reload();
  await expect(page.getByRole("list", { name: "Susturduğun şirketler" })).toContainText("ORNCM");
  await page.getByRole("button", { name: "ORNCM şirketinin sesini aç" }).click();
  await expect(page.getByText("Hiçbir şirketi susturmadın.")).toBeVisible();
});

test("the history starts empty, and the weekly message is phone-only", async ({ page }) => {
  await settings(page);
  await expect(page.getByText("Henüz telefonuna ya da e-postana bir şey gönderilmedi.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Haftalık özet: telefon ve e-posta" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Haftalık özet: bu bilgisayar" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Fiyat uyarısı: bu bilgisayar" })).toBeChecked();
});

test("the backups are listed with their age and the restore steps never become a button", async ({ page }) => {
  await settings(page);
  await expect(page.getByRole("list", { name: "Yedekler" })).toBeVisible();
  await page.getByText("Yedekten nasıl dönerim?").click();
  await expect(page.getByText(/geri-yukle\.ps1 -Kontrol/)).toBeVisible();
  await expect(page.getByRole("button", { name: /geri yükle/i })).toHaveCount(0);
});

test("the weekly summary opens from Geçmiş and steps between weeks", async ({ page }) => {
  const errors = trackErrors(page);
  await loginApi(page);
  await page.goto("/gecmis");
  await page.getByRole("link", { name: /Haftalık özet/ }).click();
  await expect(page).toHaveURL(/\/gecmis\/hafta$/);
  await expect(page.getByTestId("hafta-kaptan")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sonraki hafta" })).toBeDisabled();
  await page.getByRole("button", { name: "Önceki hafta" }).click();
  await expect(page.getByRole("button", { name: "Sonraki hafta" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("axe: the new Ayarlar blocks and the weekly page", async ({ page }) => {
  await settings(page);
  await expect(page.getByRole("list", { name: "Yedekler" })).toBeVisible();
  for (const path of ["/ayarlar", "/gecmis/hafta"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(600);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ""}`)).toEqual([]);
  }
});
