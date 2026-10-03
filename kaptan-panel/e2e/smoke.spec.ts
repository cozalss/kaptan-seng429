import { expect, test } from "@playwright/test";
import { go, login, openSettings, trackErrors } from "./helpers";

/** Login → Bugün → each screen, at desktop and phone width, with a clean console. */
test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());
});

for (const size of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`every screen opens (${size.name})`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const errors = trackErrors(page);
    await login(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Bugün \d+ öneri var\./);
    await expect(page.getByText(/Tayfa bugün \d+ bildirim okudu/)).toBeVisible();

    await page.getByRole("link", { name: /^İncele/ }).first().click();
    await expect(page).toHaveURL(/\/oneri\//);
    for (const label of ["Ne oldu?", "Neden önemli?", "Geçmişte ne oldu?", "Tayfa ne dedi?", "Risk", "Öneri"]) {
      await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("list", { name: "Tayfanın notları" }).getByRole("listitem")).toHaveCount(8);
    await expect(page.getByRole("button", { name: "Onayla", exact: true })).toBeEnabled();

    await go(page, "Portföy", /\/portfoy$/);
    await expect(page.getByRole("heading", { name: "Elindekiler" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Durdur", exact: true })).toBeVisible();

    await openSettings(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ayarlar");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("old paths land on the closest new screen", async ({ page }) => {
  await login(page);
  const cases: ReadonlyArray<readonly [string, RegExp]> = [
    ["/kopru", /\/bugun$/],
    ["/oneriler", /\/bugun$/],
    ["/kosular/run-day-e1-krgcl", /\/bugun$/],
    ["/tayfa/supheci", /\/bugun$/],
    ["/portfolio", /\/portfoy$/],
  ];
  for (const [from, to] of cases) {
    await page.goto(from);
    await expect(page).toHaveURL(to);
  }
});

test("signed out, a panel path asks for the passphrase", async ({ page }) => {
  await page.goto("/portfoy");
  await expect(page).toHaveURL(/\/login\?next=%2Fportfoy$/);
  await expect(page.getByRole("link", { name: /Tanıtım sayfası/ })).toHaveAttribute("href", "/");
});
