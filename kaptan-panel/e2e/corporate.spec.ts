import { expect, test, type Page } from "@playwright/test";
import { loginApi, trackErrors } from "./helpers";

/** Company actions: a KAP notice asks, the person writes what reached their bank, a dividend is income. */

const TODAY = "2027-01-11";

async function addKrgcl(page: Page) {
  const money = page.getByRole("region", { name: /koydun\.$/ });
  await money.getByRole("button", { name: "Elindeki bir hisseyi ekle", exact: true }).click();
  await page.getByLabel("Hisse kodu").fill("KRGCL");
  await page.getByLabel("Kaç adet?").fill("100");
  await page.getByLabel("Tanesini kaç liradan aldın?").fill("30");
  await page.getByLabel("Ne zaman aldın?").fill("2027-01-04");
  await money.getByRole("button", { name: "Hisseyi ekle", exact: true }).click();
  await expect(money.getByRole("status")).toHaveText("KRGCL eklendi: 100 adet.");
}

const section = (page: Page) => page.getByRole("region", { name: /^Hisselerin .*kâr payı/ });

test.describe("Param: dividends, bonus and rights issues", () => {
  test("a KAP notice asks; writing what reached your bank adds income, and it can be taken back", async ({ page }) => {
    const errors = trackErrors(page);
    await loginApi(page);
    await page.goto("/portfoy");
    await addKrgcl(page);

    const corp = section(page);
    const notice = corp.getByRole("article", { name: "KRGCL duyurusu" }).first();
    await expect(notice).toContainText("KRGCL kâr payı dağıtacağını açıkladı: hisse başı 1,25 ₺ brüt, ödeme 20 Ocak. Hesabına geçince buraya yaz.");
    await expect(corp.getByRole("heading", { level: 2 })).toHaveText("Hisselerin henüz sana kâr payı ödemedi.");

    await notice.getByRole("button", { name: "KRGCL: yazayım" }).click();
    const form = corp.getByRole("form", { name: "Kâr payı geldi" });
    await form.getByLabel("Ne zaman hesabına geçti?").fill(TODAY);
    await form.getByRole("button", { name: "Kâr payını yaz" }).click();
    await expect(form.getByText("Bir tutar yaz.")).toBeVisible();
    await form.getByRole("textbox", { name: "Hesabına ne kadar geçti?" }).fill("850");
    await form.getByRole("button", { name: "Kâr payını yaz" }).click();

    await expect(corp.getByRole("status").first()).toContainText("KRGCL: 850,00 ₺ kâr payı yazıldı. Kazancına eklendi.");
    await expect(corp.getByRole("heading", { level: 2 })).toContainText("toplam 850,00 ₺ kâr payı ödedi");
    await expect(page.getByRole("list", { name: "Elindekiler" })).toContainText("Bu hisseden 850,00 ₺ kâr payı aldın.");
    await expect(corp.getByRole("list", { name: "Hisse başına kâr payı" })).toContainText("KRGCL");

    await corp.getByRole("button", { name: "KRGCL: bu kaydı geri al" }).first().click();
    await expect(corp.getByRole("heading", { level: 2 })).toHaveText("Hisselerin henüz sana kâr payı ödemedi.");
    await expect(corp.getByText("Geri alındı.")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the home asks too, and 'Şimdi değil' closes a notice without touching anything", async ({ page }) => {
    const errors = trackErrors(page);
    await loginApi(page);
    await page.goto("/portfoy");
    await addKrgcl(page);
    await page.goto("/benim");
    const prompt = page.getByRole("region", { name: "Şirketlerden haberler" });
    await expect(prompt.getByRole("article", { name: "KRGCL duyurusu" })).toHaveCount(2);
    await expect(prompt).toContainText("Rakamları bildirimden güvenle okuyamadım");
    await prompt.getByRole("button", { name: "KRGCL: şimdi değil" }).first().click();
    await expect(prompt.getByRole("article", { name: "KRGCL duyurusu" })).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("a bonus issue keeps the cost, and the server's sentence shows when the count is not more", async ({ page }) => {
    const errors = trackErrors(page);
    await loginApi(page);
    await page.goto("/portfoy");
    await addKrgcl(page);
    const corp = section(page);
    await corp.getByRole("button", { name: "Bedelsiz pay geldi", exact: true }).click();
    const form = corp.getByRole("form", { name: "Bedelsiz pay geldi" });
    await form.getByLabel("Hisse kodu").fill("KRGCL");
    await form.getByLabel("Hangi gün yeni fiyattan işlem görmeye başladı?").fill(TODAY);
    await form.getByLabel("Yeni toplam adedin").fill("100");
    await form.getByRole("button", { name: "Bedelsiz payı yaz" }).click();
    await expect(form.getByRole("alert").filter({ hasText: "Yeni adet, şimdiki adetten büyük olmalı." })).toBeVisible();

    await form.getByLabel("Yeni toplam adedin").fill("200");
    await form.getByRole("button", { name: "Bedelsiz payı yaz" }).click();
    await expect(corp.getByRole("status").first()).toContainText("KRGCL: bedelsiz pay yazıldı.");
    await expect(page.getByRole("list", { name: "Elindekiler" })).toContainText("200 adet aldın, 3.000 ₺ ödedin.");
    await expect(corp.getByRole("list").last()).toContainText("100 yeni pay geldi, toplam 200 adet. Maliyetin aynı kaldı.");
    expect(errors).toEqual([]);
  });
});
