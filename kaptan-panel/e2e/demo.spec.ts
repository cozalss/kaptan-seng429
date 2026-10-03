import { expect, test, type Page } from "@playwright/test";

/** Guided demo (FRONTEND-SPEC §7, 11 §2): start from /admin, walk all steps with →. */
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill("kaptan-demo");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

interface Step {
  id: string;
  path: RegExp;
  check?: (p: Page) => Promise<void>;
}

const STEPS: readonly Step[] = [
  {
    id: "1",
    path: /\/inbox$/,
    check: async (p) => {
      await expect(p.getByRole("navigation", { name: "Ana gezinme" }).first().getByText("Zeynep (Risk Officer)")).toBeVisible();
    },
  },
  {
    id: "2a",
    path: /\/inbox$/,
    check: async (p) => {
      await expect(p.getByRole("navigation", { name: "Ana gezinme" }).first().getByText("Burak (Admin)")).toBeVisible();
      await expect(p.getByText("Senaryo: E3 sözleşme bildirimi düşer").first()).toBeVisible();
    },
  },
  { id: "2b", path: /\/runs\/run-demo-e3-ornek$/ },
  { id: "2c", path: /\/runs\/run-demo-e3-ornek#kanit$/ },
  { id: "2d", path: /#supheci$/ },
  { id: "2e", path: /#kural$/ },
  {
    id: "2f",
    path: /\/approvals\?oneri=prop-demo-e3-ornek$/,
    check: async (p) => {
      await p.getByRole("button", { name: "Yedek: otomatik onayla" }).click();
      await expect(p.getByText("Öneri onaylandı").first()).toBeVisible({ timeout: 15_000 });
    },
  },
  { id: "2g", path: /#iz$/ },
  { id: "3a", path: /\/runs\/run-demo-redteam-dmogd$/ },
  { id: "3b", path: /\/runs\/run-demo-r04-tmslj$/ },
  { id: "4a", path: /\/portfolio$/ },
  { id: "4b", path: /\/portfolio$/ },
  { id: "4c", path: /\/portfolio$/ },
  {
    id: "4d",
    path: /\/audit\?dogrula=temiz/,
    check: async (p) => {
      await expect(p.getByText(/kayıt · hash zinciri geçerli/)).toBeVisible({ timeout: 15_000 });
    },
  },
  {
    id: "4e",
    path: /\/audit\?dogrula=kurcalama/,
    check: async (p) => {
      await expect(p.getByText("Kayıt #3.907'de zincir kırık")).toBeVisible({ timeout: 15_000 });
    },
  },
  { id: "5", path: /\/eval$/ },
  { id: "6", path: /\/portfolio\?sekme=fis$/ },
];

test("the Admin starts the guided demo and walks steps 1–6 with the keyboard", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "admin@kaptan.demo");
  await page.goto("/admin?sekme=demo");
  await page.getByRole("button", { name: "Rehberli demoyu başlat" }).click();
  const rail = page.getByRole("region", { name: "Rehberli demo şeridi" });
  await expect(rail).toBeVisible();

  for (const [i, s] of STEPS.entries()) {
    if (i > 0) {
      await page.keyboard.press("Escape");
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("ArrowRight");
    }
    await expect(rail.locator(".code").first()).toHaveText(s.id);
    await expect(page).toHaveURL(s.path, { timeout: 20_000 });
    await expect(rail.getByText(`${i + 1} / ${STEPS.length}`)).toBeVisible();
    await s.check?.(page);
  }
  await rail.getByRole("button", { name: "Demoyu bitir" }).click();
  await expect(rail).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the guided demo is offered only to the Admin", async ({ page }) => {
  await login(page, "risk@kaptan.demo");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("option", { name: /Rehberli demoyu başlat/ })).toHaveCount(0);
});
