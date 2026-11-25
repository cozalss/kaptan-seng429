import { expect, test } from "@playwright/test";
import { loginApi, seedMock, trackErrors } from "./helpers";

/** "Öneriye düşenler" on the home and /oneriler, from the test double. */
test.describe("Öneriye düşenler", () => {
  test("the home block lists suggestions; a row opens its proposal; the page filters by status", async ({ page }) => {
    const errors = trackErrors(page);
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/benim");
    const block = page.getByTestId("oneriye-dusenler");
    await expect(block.getByRole("heading", { name: "Öneriye düşenler" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Başlamak için" })).toHaveCount(0);
    const rows = block.getByRole("list", { name: "Son öneriler" }).getByRole("link");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeLessThanOrEqual(5);

    await page.goto("/oneriler");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Öneriye düşenler");
    const all = page.getByRole("list", { name: "Öneriler: Hepsi" }).getByRole("link");
    await expect(all.first()).toBeVisible();
    await page.getByRole("button", { name: /^Bekliyor/ }).click();
    await expect(page).toHaveURL(/\?durum=bekliyor$/);
    await expect(page.getByRole("button", { name: /^Bekliyor/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^Hepsi/ }).click();
    await expect(page).toHaveURL(/\/oneriler$/);

    await all.first().click();
    await expect(page).toHaveURL(/\/oneri\/[^/]+$/);
    expect(errors).toEqual([]);
  });
});
