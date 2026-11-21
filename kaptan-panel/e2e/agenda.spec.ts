import { expect, test } from "@playwright/test";
import { loginApi, seedMock, trackErrors } from "./helpers";

/** The calendar card, the calendar page and the market strip, from the test double. */
test.describe("Takvim and the market strip", () => {
  test("the home shows the market line and the next dates, and leads to the calendar", async ({ page }) => {
    const errors = trackErrors(page);
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/benim");
    await expect(page.getByRole("group", { name: "Piyasa" })).toContainText("BIST 100");
    await expect(page.getByRole("heading", { name: "Önümüzdeki 2 hafta" })).toBeVisible();
    await page.getByRole("link", { name: /Takvimin tamamı/ }).click();
    await expect(page).toHaveURL(/\/takvim$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Takvim");
    await expect(page.getByText("Enflasyon açıklama günlerini göstermiyorum")).toBeVisible();
    await page.getByRole("button", { name: "14 gün" }).click();
    await expect(page.getByRole("button", { name: "14 gün" })).toHaveAttribute("aria-pressed", "true");
    expect(errors).toEqual([]);
  });

  test("Okunanlar links to the calendar", async ({ page }) => {
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/bildirimler");
    await page.getByRole("link", { name: /takvime bak/ }).click();
    await expect(page).toHaveURL(/\/takvim$/);
  });
});
