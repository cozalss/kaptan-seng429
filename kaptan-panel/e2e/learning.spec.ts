import { expect, test } from "@playwright/test";
import { gotoAyarlar, loginApi, seedMock, trackErrors } from "./helpers";

/** "Ne öğrendim": the home link, Geri al on the report, and the self-learning switch in Ayarlar (test double). */
test.describe("Ne öğrendim", () => {
  test("the home's learning block opens the report, where a change is undone", async ({ page }) => {
    const errors = trackErrors(page);
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/benim");
    const block = page.getByRole("region", { name: "KAPtan bugün ne öğrendi" });
    await expect(block.getByTestId("ders")).toContainText("geri alım eşiğini");
    await block.getByRole("link", { name: /Ne öğrendim/ }).click();
    await expect(page).toHaveURL(/\/ogrendiklerim$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ne öğrendim");
    await expect(page.getByTestId("tur-E4")).toContainText("Finansal sonuç");
    const change = page.getByTestId("degisiklik-2");
    await change.getByRole("button", { name: /Geri al/ }).click();
    await expect(change).toContainText("Geri alındı");
    await expect(change.getByRole("button")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("Ayarlar turns self-learning off and it stays off", async ({ page }) => {
    await seedMock(page, {});
    await loginApi(page);
    await gotoAyarlar(page);
    const sw = page.getByRole("switch", { name: "Kendi kendine öğrenme" });
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText("Kapalı: KAPtan değişiklikleri yalnızca önerir, kendisi uygulamaz.")).toBeVisible();
    await page.goto("/ogrendiklerim");
    await expect(page.getByText("Kendi kendine öğrenme kapalı", { exact: false })).toBeVisible();
  });
});
