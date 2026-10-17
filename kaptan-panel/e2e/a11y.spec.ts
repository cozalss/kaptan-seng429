import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginApi } from "./helpers";

/** WCAG 2.2 A/AA (axe-core) on every screen, after its data has loaded, from the smallest phone to desktop. */
const SCREENS: ReadonlyArray<{ path: string; signedIn: boolean; ready: (p: Page) => Promise<void> }> = [
  { path: "/login", signedIn: false, ready: (p) => expect(p.getByRole("radiogroup", { name: "Hesap" })).toBeVisible() },
  ...["analist", "risk", "yonetici", "denetci"].map((slug) => ({
    path: `/login/${slug}`,
    signedIn: false,
    ready: (p: Page) => expect(p.getByLabel("Parola")).toBeVisible(),
  })),
  // An unknown account slug renders the 404 page without a session (signed-out /does-not-exist redirects to /login).
  { path: "/login/kral", signedIn: false, ready: (p) => expect(p.getByRole("heading", { level: 1, name: "Sayfa bulunamadı." })).toBeVisible() },
  { path: "/bugun", signedIn: true, ready: (p) => expect(p.getByRole("list", { name: "Bekleyen öneriler" })).toBeVisible() },
  { path: "/oneri/prop-day-e1-krgcl", signedIn: true, ready: (p) => expect(p.getByRole("region", { name: "Öneri" })).toBeVisible() },
  { path: "/portfoy", signedIn: true, ready: (p) => expect(p.getByRole("button", { name: "Durdur", exact: true })).toBeVisible() },
  { path: "/denetim", signedIn: true, ready: (p) => expect(p.getByRole("list", { name: "Denetim kayıtları" })).toBeVisible() },
  { path: "/ayarlar", signedIn: true, ready: (p) => expect(p.getByRole("list", { name: "Geçerli sınırlar" })).toBeVisible() },
];

for (const width of [320, 390, 1440]) {
  for (const s of SCREENS) {
    test(`axe @${width}: ${s.path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      if (s.signedIn) await loginApi(page);
      await page.goto(s.path);
      await s.ready(page);
      await page.waitForTimeout(700); // let entry animations settle (contrast is measured on final colours)
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const summary = result.violations.map((v) => `${v.impact ?? "?"} ${v.id} ×${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`);
      expect(summary, summary.join("\n")).toEqual([]);
    });
  }
}
