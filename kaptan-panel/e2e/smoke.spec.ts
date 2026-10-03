import { expect, test, type Page } from "@playwright/test";

/**
 * Foundation smoke (mock mode): every seeded role can sign in, the shell renders, the route
 * guards hold, and no page logs a console error. Screen engineers add their own specs.
 */
const ROLES = [
  { label: "Risk Officer", email: "risk@kaptan.demo", home: "/approvals", admin: false },
  { label: "Admin", email: "admin@kaptan.demo", home: "/inbox", admin: true },
  { label: "Analist", email: "analist@kaptan.demo", home: "/inbox", admin: false },
  { label: "Auditor", email: "denetci@kaptan.demo", home: "/inbox", admin: false },
] as const;

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
  await page.getByRole("button", { name: "Giriş yap" }).click();
}

test("unauthenticated visits are sent to /login with a return path", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/audit");
  await expect(page).toHaveURL(/\/login\?next=%2Faudit$/);
  await expect(page.getByRole("heading", { name: "Panele giriş" })).toBeVisible();
  await expect(page.getByText("Demo hesapları")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a wrong password is refused without leaking which part was wrong", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill("risk@kaptan.demo");
  await page.getByLabel("Parola").fill("yanlis-parola");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.locator("#login-error")).toHaveText("Kimlik doğrulanamadı.");
  await expect(page).toHaveURL(/\/login$/);
});

for (const role of ROLES) {
  test(`${role.label}: signs in, sees the shell, and the guards hold`, async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, role.email);
    await expect(page).toHaveURL(new RegExp(`${role.home}$`));

    const nav = page.getByRole("navigation", { name: "Ana gezinme" }).first();
    await expect(nav.getByRole("link", { name: "Canlı akış", exact: true })).toBeVisible();
    await expect(page.getByText("DEMO VERİSİ").first()).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText(/yatırım tavsiyesi değildir/i).first()).toBeVisible();
    await expect(nav.getByRole("link", { name: "Yönetim", exact: true })).toHaveCount(role.admin ? 1 : 0);

    await page.goto("/admin");
    if (role.admin) {
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/yönetim/i);
    } else {
      await expect(page).toHaveURL(/\/yetkisiz\?from=%2Fadmin$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/rolünüze kapalı/i);
    }

    await page.goto("/login");
    await expect(page).toHaveURL(new RegExp(`${role.home}$`));

    expect(errors).toEqual([]);
  });
}

test("every placeholder route renders for the Admin", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "admin@kaptan.demo");
  await expect(page).toHaveURL(/\/inbox$/);
  for (const path of ["/approvals", "/runs", "/runs/run-demo-e3-ornek", "/portfolio", "/brief", "/audit", "/limits", "/eval", "/admin", "/styleguide"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("logout clears the session", async ({ page }) => {
  await login(page, "analist@kaptan.demo");
  await expect(page).toHaveURL(/\/inbox$/);
  await page.getByRole("button", { name: /Çıkış/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/inbox");
  await expect(page).toHaveURL(/\/login\?next=%2Finbox$/);
});

test("the shell works at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "risk@kaptan.demo");
  await page.getByRole("button", { name: /Menü/ }).click();
  const drawer = page.getByRole("dialog", { name: "Menü" });
  await drawer.getByRole("link", { name: "Portföy" }).click();
  await expect(page).toHaveURL(/\/portfolio$/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
