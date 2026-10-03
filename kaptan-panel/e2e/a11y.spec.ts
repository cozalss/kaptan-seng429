import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginApi } from "./helpers";

/** WCAG 2.1 A/AA (axe-core) on every screen, after its data has loaded, at both widths. */
const SCREENS: ReadonlyArray<{ path: string; signedIn: boolean; ready: (p: Page) => Promise<void> }> = [
  { path: "/login", signedIn: false, ready: (p) => expect(p.getByLabel("Parola")).toBeVisible() },
  { path: "/bugun", signedIn: true, ready: (p) => expect(p.getByRole("list", { name: "Bekleyen öneriler" })).toBeVisible() },
  { path: "/oneri/prop-day-e1-krgcl", signedIn: true, ready: (p) => expect(p.getByRole("list", { name: "Tayfanın notları" })).toBeVisible() },
  { path: "/portfoy", signedIn: true, ready: (p) => expect(p.getByRole("list", { name: "Elindekiler" })).toBeVisible() },
  { path: "/ayarlar", signedIn: true, ready: (p) => expect(p.getByTestId("reset-clock")).toBeVisible() },
];

for (const width of [390, 1440]) {
  for (const s of SCREENS) {
    test(`axe @${width}: ${s.path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      if (s.signedIn) await loginApi(page);
      await page.goto(s.path);
      await s.ready(page);
      await page.waitForTimeout(700); // let ink-in animations settle (contrast is measured on final colours)
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const summary = result.violations.map((v) => `${v.impact ?? "?"} ${v.id} ×${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`);
      expect(summary, summary.join("\n")).toEqual([]);
    });
  }
}
