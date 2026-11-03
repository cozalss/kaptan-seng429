import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginApi } from "./helpers";
import { SCREENS } from "./screens";

async function expectNoViolations(page: Page) {
  await page.waitForTimeout(700); // let entry animations settle (contrast is measured on final colours)
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const summary = result.violations.map((v) => `${v.impact ?? "?"} ${v.id} ×${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

/** WCAG 2.2 A/AA (axe-core) on every screen, after its data has loaded, from the smallest phone to desktop. */
for (const width of [320, 390, 1440]) {
  test.describe(`axe @${width}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    });

    test("/login", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByLabel("Parola")).toBeVisible();
      await expectNoViolations(page);
    });

    test("404", async ({ page }) => {
      await loginApi(page);
      await page.goto("/boyle-bir-sayfa-yok");
      await expect(page.getByRole("heading", { level: 1, name: "Sayfa bulunamadı." })).toBeVisible();
      await expectNoViolations(page);
    });

    for (const s of SCREENS) {
      test(s.path, async ({ page }) => {
        await loginApi(page);
        await page.goto(s.path);
        await s.ready(page);
        await expectNoViolations(page);
      });
    }
  });
}
