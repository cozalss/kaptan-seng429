import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Accessibility pass (WCAG 2.1 A/AA via axe-core) on every route, signed in as the role
 * that sees the most on it. The demo strip and dialogs are covered by the guided-demo spec;
 * here each screen is checked at rest, after its data has loaded.
 */
const ROUTES: ReadonlyArray<{ path: string; email: string; ready: (p: Page) => Promise<void> }> = [
  { path: "/login", email: "", ready: (p) => expect(p.getByRole("heading", { name: "Panele giriş" })).toBeVisible() },
  { path: "/inbox", email: "risk@kaptan.demo", ready: (p) => expect(p.getByRole("table").first()).toBeVisible() },
  { path: "/approvals", email: "risk@kaptan.demo", ready: (p) => expect(p.getByRole("article")).toBeVisible() },
  { path: "/runs", email: "analist@kaptan.demo", ready: (p) => expect(p.getByRole("table").first()).toBeVisible() },
  { path: "/runs/run-day-e1-tmsmk", email: "analist@kaptan.demo", ready: (p) => expect(p.locator("#bildirim")).toBeVisible() },
  { path: "/runs/run-demo-e3-ornek", email: "admin@kaptan.demo", ready: (p) => expect(p.getByText("Bu demo çalıştırması henüz başlamadı")).toBeVisible() },
  { path: "/portfolio", email: "risk@kaptan.demo", ready: (p) => expect(p.getByTestId("kill-state")).toBeVisible() },
  { path: "/portfolio?sekme=fis", email: "risk@kaptan.demo", ready: (p) => expect(p.getByText(/T-2027-0111-003/).first()).toBeVisible() },
  { path: "/brief", email: "denetci@kaptan.demo", ready: (p) => expect(p.getByText("LLM üretimi, doğrulanmamış").first()).toBeVisible() },
  { path: "/audit", email: "denetci@kaptan.demo", ready: (p) => expect(p.getByRole("table").first()).toBeVisible() },
  { path: "/limits", email: "risk@kaptan.demo", ready: (p) => expect(p.getByRole("heading", { name: /Geçerli sürüm/ }).first()).toBeVisible() },
  { path: "/eval", email: "analist@kaptan.demo", ready: (p) => expect(p.getByTestId("sample-stamp")).toBeVisible() },
  { path: "/admin", email: "admin@kaptan.demo", ready: (p) => expect(p.getByRole("tablist").first()).toBeVisible() },
  { path: "/yetkisiz", email: "analist@kaptan.demo", ready: (p) => expect(p.getByRole("main")).toBeVisible() },
  { path: "/styleguide", email: "risk@kaptan.demo", ready: (p) => expect(p.getByRole("main")).toBeVisible() },
];

async function login(page: Page, email: string) {
  const r = await page.request.post("/api/mock/session", { data: { email, password: "kaptan-demo" } });
  expect(r.ok()).toBe(true);
}

for (const r of ROUTES) {
  test(`axe: ${r.path} has no WCAG 2.1 A/AA violations`, async ({ page }) => {
    if (r.email) await login(page, r.email);
    await page.goto(r.path);
    await r.ready(page);
    await page.waitForTimeout(600); // let ink-in animations settle (contrast is measured on final colours)
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const summary = result.violations.map((v) => `${v.impact ?? "?"} ${v.id} ×${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`);
    expect(summary, summary.join("\n")).toEqual([]);
  });
}

test("axe: the guided demo strip and a desk toast pass WCAG 2.1 A/AA", async ({ page }) => {
  await login(page, "admin@kaptan.demo");
  await page.goto("/admin?sekme=demo");
  await page.getByRole("button", { name: "Rehberli demoyu başlat" }).click();
  const rail = page.getByRole("region", { name: "Rehberli demo şeridi" });
  await expect(rail).toBeVisible();
  await page.keyboard.press("ArrowRight"); // 2a: Admin injects → "Senaryo: …" toast
  await expect(page.getByText(/^Senaryo: /).first()).toBeVisible({ timeout: 15_000 });
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = result.violations.map((v) => `${v.impact ?? "?"} ${v.id} ×${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
});
