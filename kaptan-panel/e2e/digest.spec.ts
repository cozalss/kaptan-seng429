import { expect, test } from "@playwright/test";
import { loginApi, seedMock, trackErrors } from "./helpers";

/** The important-disclosures card on the home and /onemli, from the test double. */
test.describe("Önemli duyurular", () => {
  test("the home card shows the first ones and leads to the whole day", async ({ page }) => {
    const errors = trackErrors(page);
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/benim");
    await expect(page.getByRole("heading", { name: "Bugün önemli duyurular" })).toBeVisible();
    await page.getByRole("link", { name: /Hepsini gör|Önemli duyurulara git/ }).click();
    await expect(page).toHaveURL(/\/onemli$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Önemli duyurular");
    await expect(page.getByRole("link", { name: /KAP’ta aç/ }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the day buttons walk the trading days and the next day stops at today", async ({ page }) => {
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/onemli");
    const next = page.getByRole("button", { name: /Sonraki gün/ });
    await expect(next).toBeDisabled();
    const label = page.locator(".dg-day");
    const before = await label.textContent();
    await page.getByRole("button", { name: /Önceki gün/ }).click();
    await expect(label).not.toHaveText(before ?? "");
    await expect(next).toBeEnabled();
    // The day is in the link, so Back returns to the first day.
    await expect(page).toHaveURL(/\/onemli\?gun=\d{4}-\d{2}-\d{2}$/);
    await page.goBack();
    await expect(label).toHaveText(before ?? "");
  });

  test("Okunanlar links to the digest", async ({ page }) => {
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/bildirimler");
    await page.getByRole("link", { name: /önemli duyurularına bak/ }).click();
    await expect(page).toHaveURL(/\/onemli$/);
  });
});
