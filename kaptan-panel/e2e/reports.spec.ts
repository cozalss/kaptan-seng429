import { expect, test } from "@playwright/test";
import { go, loginApi, mainNav, seedMock, trackErrors } from "./helpers";

/** KAPtan ne kadar tuttu, Karne, the morning line and the benchmark: all from the test double, all honest. */
test.describe("Karne and the track record", () => {
  test("the home shows 'Bu sabah' and the benchmark sentence", async ({ page }) => {
    const errors = trackErrors(page);
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/benim");
    await expect(page.getByTestId("bu-sabah")).toContainText("Bu sabah");
    await expect(page.getByTestId("benchmark-line")).toContainText(/aynı sürede BIST 100 %3,2 arttı/);
    expect(errors).toEqual([]);
  });

  test("a new install shows neither the brief nor a benchmark: nothing is guessed", async ({ page }) => {
    await seedMock(page, { fresh: true });
    await loginApi(page);
    await page.goto("/benim");
    await expect(page.getByRole("heading", { level: 1, name: "Ne kadar parayla başlıyorsun?" })).toBeVisible();
    await expect(page.getByTestId("bu-sabah")).toHaveCount(0);
    await expect(page.getByTestId("benchmark-line")).toHaveCount(0);
  });

  test("Geçmiş leads to the Karne: the money, the honest track record and every suggestion", async ({ page }) => {
    const errors = trackErrors(page);
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/benim");
    await go(page, "Geçmiş", /\/gecmis$/);
    await page.getByRole("link", { name: /Aylık ve yıllık karne/ }).click();
    await expect(page).toHaveURL(/\/gecmis\/karne$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/döneminde/);
    await expect(page.getByTestId("karne-para")).toContainText("Koyduğun para");
    // A suggestion whose period is not over never shows a made-up result.
    await expect(page.getByTestId("track-list")).toContainText(/Sonuç \d+ \p{L}+'(ta|te|da|de) belli olur/u);
    // The month before has finished suggestions: the honest word about how few they are, and the comparison.
    await page.getByRole("button", { name: "Önceki ay" }).click();
    await expect(page.getByTestId("track-caveat")).toContainText("bu kadar azla bir şey söylemek erken");
    await expect(page.getByTestId("track-compare")).toContainText("Her öneriyi izleseydin");
    // Geçmiş stays the current place in the bar.
    await expect(mainNav(page).getByRole("link", { name: "Geçmiş", exact: true })).toHaveAttribute("aria-current", "page");
    expect(errors).toEqual([]);
  });

  test("the period moves back, and a year can be chosen", async ({ page }) => {
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/gecmis/karne");
    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toContainText(/döneminde/);
    await expect(page.getByRole("button", { name: "Sonraki ay" })).toBeDisabled();
    const before = await title.textContent();
    await page.getByRole("button", { name: "Önceki ay" }).click();
    await expect(title).not.toHaveText(before ?? "");
    await page.getByRole("button", { name: "Yıl", exact: true }).click();
    await expect(title).toContainText(/\d{4} döneminde/);
  });

  test("printed, the Karne drops the bar and its buttons and keeps its figures (always light)", async ({ page }) => {
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/gecmis/karne");
    await expect(page.getByTestId("karne-para")).toBeVisible();
    await page.emulateMedia({ media: "print", colorScheme: "dark" });
    await expect(page.getByRole("navigation", { name: "Ana gezinme" })).toBeHidden();
    await expect(page.getByRole("button", { name: /Yazdır/ })).toBeHidden();
    await expect(page.getByTestId("karne-para")).toBeVisible();
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(255, 255, 255)");
  });
});
