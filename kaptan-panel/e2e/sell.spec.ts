import { expect, test } from "@playwright/test";
import { IS_API } from "./backend";
import { login, trackErrors } from "./helpers";

/**
 * A sell (an exit from a held position): the mock seeds an X1 time exit on KRGSG. Bugün tags it
 * Satış; Onayla gives an emir fişi with the SAT badge; Girdim records the sale at the limit.
 * Mock only: the seeded exit is a mock fixture (the http suite has no fixed held position).
 */
test.skip(IS_API, "the seeded sell is a mock fixture");

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());
});

test("X1 çıkışı → Satış → Onayla → SAT fişi → Girdim", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await login(page);

  const list = page.getByRole("list", { name: "Bekleyen öneriler" });
  const card = list.getByRole("article").filter({ has: page.locator('[data-side="sell"]') });
  await expect(card).toHaveCount(1);
  await expect(card.locator('[data-side="sell"]')).toHaveText("Satış");
  await expect(card).toContainText("Tutma süresi doldu");
  await expect(card).toContainText(/1\.800 lot · en az /);

  await card.getByRole("link", { name: /^İncele/ }).click();
  await expect(page).toHaveURL(/\/oneri\/prop-exit-x1-krgsg$/);
  await expect(page.getByRole("region", { name: "Öneri" })).toContainText(/1\.800 lot sat · limit /);
  await page.getByRole("button", { name: "Onayla", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^İmzalandı · \d\d:\d\d$/ })).toBeFocused();

  // The sell slip: SAT in red, the held lots, never more.
  const slip = page.getByRole("group", { name: /^Emir fişi/ });
  await expect(slip).toBeVisible({ timeout: 10_000 });
  const badge = slip.locator('[data-side="sell"]');
  await expect(badge).toHaveText("SAT");
  await expect(badge).toHaveAttribute("aria-label", "Satış");
  await expect(slip).toContainText("KRGSG");
  await expect(slip).toContainText("1.800");
  await expect(slip.locator('[data-side="buy"]')).toHaveCount(0);

  await slip.getByRole("button", { name: "Girdim" }).click();
  await slip.getByRole("button", { name: "Kaydet" }).click();
  await expect(slip.getByText(/Girildi · 1\.800 lot/)).toBeVisible();

  expect(errors).toEqual([]);
});
