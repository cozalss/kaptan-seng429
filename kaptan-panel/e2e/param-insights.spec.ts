import { expect, test } from "@playwright/test";
import { loginApi, trackErrors } from "./helpers";

/** What Param says about your own money: where it stands, sold shares, return and risk, notes. */

test.describe("Param: insights", () => {
  test("shows where the money stands and the limit changes only the sentence", async ({ page }) => {
    const errors = trackErrors(page);
    await loginApi(page);
    await page.goto("/portfoy");

    const where = page.getByRole("region", { name: /Paranın en büyük parçası|tek hissede/ });
    await expect(where).toBeVisible();
    await expect(where.getByRole("list", { name: "Hisse başına pay" })).toContainText("Nakit");
    await expect(where.getByRole("list", { name: "Sektör başına pay" })).toBeVisible();

    await where.getByLabel("Uyarı çizgisi: tek hissede paranın yüzde kaçı olunca sana söyleyeyim?").fill("3");
    await where.getByRole("button", { name: "Uyarı çizgisini kaydet" }).click();
    await expect(where.getByRole("status")).toHaveText("Sınır 5 ile 100 arasında bir tam sayı olsun.");

    await where.getByLabel("Uyarı çizgisi: tek hissede paranın yüzde kaçı olunca sana söyleyeyim?").fill("5");
    await where.getByRole("button", { name: "Uyarı çizgisini kaydet" }).click();
    await expect(where.getByRole("status")).toHaveText("Sınırın %5 oldu.");
    await expect(where.getByRole("heading", { level: 2 })).toContainText("tek hissede");
    await expect(where.getByRole("heading", { level: 2 })).toContainText("Sınırın %5.");
    expect(errors).toEqual([]);
  });

  test("lists the shares you sold and the return and risk figures with their days", async ({ page }) => {
    await loginApi(page);
    await page.goto("/portfoy");

    const sold = page.getByRole("region", { name: /Sattığın/ });
    await expect(sold.getByRole("heading", { level: 2 })).toHaveText("Sattığın 2 işlemin 1 tanesi kazandırdı.");
    await expect(sold.getByRole("list", { name: "Kapanmış işlemler" })).toContainText("TMSLJ");
    await expect(sold).toContainText("6 gün tuttun");
    await expect(sold).toContainText("Henüz çok az satış var");

    const stats = page.getByRole("region", { name: /Para eklemeyi ve çekmeyi çıkarınca/ });
    await expect(stats.getByRole("list", { name: "Karşılaştırılamayanlar" })).toContainText("tahmin yazmıyorum");
    const figures = stats.getByRole("list", { name: "Getiri ve risk" }).or(stats.getByLabel("Getiri ve risk"));
    await expect(figures).toContainText("En iyi gün");
    await expect(figures).toContainText("Zirveden en büyük düşüş");
  });

  test("a private note is written, changed and deleted", async ({ page }) => {
    const errors = trackErrors(page);
    await loginApi(page);
    await page.goto("/portfoy");

    const notes = page.getByRole("region", { name: /not yazabilirsin|not yazmışsın/ });
    const first = notes.getByRole("listitem").first();
    const ticker = (await first.getAttribute("aria-label"))?.replace(" notu", "") ?? "";
    await first.getByRole("button", { name: `${ticker} için not yaz` }).click();
    await first.getByRole("button", { name: "Notu kaydet" }).click();
    await expect(first.getByRole("alert")).toHaveText("Notun en az 3 harf olsun.");

    await first.getByLabel("Neden aldın, ne zaman satmayı düşünüyorsun?").fill("Kâr payı için aldım.");
    await first.getByRole("button", { name: "Notu kaydet" }).click();
    await expect(first).toContainText("Kâr payı için aldım.");
    await expect(page.getByRole("region", { name: /not yazmışsın/ }).getByRole("heading", { level: 2 })).toHaveText("Hisselerine 1 not yazmışsın.");

    await first.getByRole("button", { name: `${ticker} notunu değiştir` }).click();
    await first.getByLabel("Neden aldın, ne zaman satmayı düşünüyorsun?").fill("%30 olunca satarım.");
    await first.getByRole("button", { name: "Notu kaydet" }).click();
    await expect(first).toContainText("%30 olunca satarım.");

    await first.getByRole("button", { name: `${ticker} notunu sil` }).click();
    await expect(first.getByRole("button", { name: `${ticker} için not yaz` })).toBeVisible();

    await page.goto("/gecmis");
    await expect(page.getByText("için yazdığın notu sildin.").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
