import { expect, test } from "@playwright/test";
import { loginApi, seedMock, trackErrors } from "./helpers";

/** The calendar card, the calendar page and the market strip, from the test double. */
test.describe("Takvim and the market strip", () => {
  test("the home leads to the calendar, which carries the market line and the dates", async ({ page }) => {
    const errors = trackErrors(page);
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/benim");
    await page.getByRole("navigation", { name: "Daha fazlası" }).getByRole("link", { name: /^Takvim/ }).click();
    await expect(page).toHaveURL(/\/takvim$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Takvim");
    await expect(page.getByRole("group", { name: "Piyasa" })).toContainText("BIST 100");
    await expect(page.getByText("Enflasyon açıklama günlerini göstermiyorum")).toBeVisible();
    await page.getByRole("button", { name: "14 gün" }).click();
    await expect(page.getByRole("button", { name: "14 gün" })).toHaveAttribute("aria-pressed", "true");
    expect(errors).toEqual([]);
  });

  test("Okunanlar links to the calendar", async ({ page }) => {
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/bildirimler");
    await page.locator(".ok-screen").getByRole("link", { name: "Takvim", exact: true }).click();
    await expect(page).toHaveURL(/\/takvim$/);
  });
});
