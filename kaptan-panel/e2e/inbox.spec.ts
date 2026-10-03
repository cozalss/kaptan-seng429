import { expect, test, type Page } from "@playwright/test";

/** /inbox (FRONTEND-SPEC §2.2): live feed, funnel, keyboard triage, drawer, roles. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill("kaptan-demo");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
}

test("Analist: counters, funnel, keyboard triage and a note", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "analist@kaptan.demo");
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/canlı akış/i);
  await expect(page.getByText(/itibarıyla \d+ bildirim · devre kesici/)).toBeVisible();
  await expect(page.getByText(/Bugün: \d+ çağrı · ~0,\dM token/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hat hunisi" })).toBeVisible();

  const table = page.getByRole("table");
  await expect(table.getByRole("row").nth(1)).toBeVisible();
  await page.keyboard.press("/");
  await expect(page.getByLabel(/Sembol, şirket ya da konu ara/)).toBeFocused();
  await page.keyboard.type("KRGCL geri alim");
  await expect(table.getByRole("row")).toHaveCount(2);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("j");
  await expect(table.locator('tr[aria-selected="true"]')).toHaveCount(1);
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Ön eleme")).toBeVisible();
  await expect(drawer.getByRole("link", { name: /Neden bu işlem/ })).toBeVisible();
  await drawer.getByLabel("Yeni not").fill("E2E notu: izlemede.");
  await drawer.getByRole("button", { name: "Not ekle" }).click();
  await expect(drawer.getByText("E2E notu: izlemede.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Auditor: read-only feed (no notes, no scenarios)", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "denetci@kaptan.demo");
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByRole("button", { name: "Senaryo" })).toBeDisabled();
  await page.getByRole("table").getByRole("row").nth(1).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Not ekle" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("phone width: no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "analist@kaptan.demo");
  await expect(page.getByRole("table")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
