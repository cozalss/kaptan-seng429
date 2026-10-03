import { expect, test, type Page } from "@playwright/test";

/**
 * Demo path (FRONTEND-SPEC §7, 11 Adım 2a → 2f): Admin injects the E3 disclosure → it lands
 * in the live feed → the graph stops at interrupt() and the approval card arrives over SSE →
 * the Risk Officer approves with a comment and code → SimBIST paper fill + audit entry.
 */
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

test("demo: disclosure arrives → approval card → Risk Officer approves → fill", async ({ page }) => {
  test.setTimeout(60_000);
  const errors = trackErrors(page);
  await login(page, "admin@kaptan.demo");
  await expect(page).toHaveURL(/\/inbox$/);

  await page.getByRole("button", { name: /Senaryo menüsü/ }).click();
  await page.getByRole("menuitem", { name: /E3: Yeni iş ilişkisi/ }).click();
  const row = page.locator("#bildirim-1651901");
  await expect(row).toBeVisible();
  await expect(row.getByText("DEMO FİKSTÜRÜ")).toBeVisible();

  // Same tab (the mock desk lives in it): go to the queue and take the Risk Officer seat.
  await page.getByRole("navigation", { name: "Ana gezinme" }).first().getByRole("link", { name: /Onay kuyruğu/ }).click();
  await expect(page).toHaveURL(/\/approvals$/);
  await page.getByRole("group", { name: /Rol değiştir/ }).first().getByRole("button", { name: "Risk Officer" }).click();

  const arrival = page.getByRole("button", { name: /Yeni onay talebi · ORNEK/ });
  await expect(arrival).toBeVisible({ timeout: 15_000 });
  await arrival.click();
  const card = page.getByRole("article");
  await expect(card.getByRole("heading", { name: /ORNEK/ })).toBeVisible();
  await expect(card.getByText("interrupt() · bekliyor")).toBeVisible();

  await card.getByRole("button", { name: "Onayla", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Karar gerekçesi/).fill("Kanıt güçlü, sızıntı eşiğin altında; şüpheci küçültmesiyle onay.");
  await dialog.getByLabel(/Doğrulama kodu/).fill("000000");
  await dialog.getByRole("button", { name: "Onayla ve gönder" }).click();

  await expect(card.getByText("Onaylandı", { exact: true }).first()).toBeVisible();
  await expect(card.getByText(/1\.240 lot @ 48,32 TL/)).toBeVisible({ timeout: 10_000 });
  await expect(card.getByText("approval.decided")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Analist sees the queue read-only; the decision fits one 1440×900 screen", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "analist@kaptan.demo");
  await page.goto("/approvals");
  const card = page.getByRole("article");
  await expect(card.getByRole("button", { name: "Onayla", exact: true })).toBeDisabled();
  await expect(page.getByText(/Salt okunur · Analist/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("Risk Officer: the action bar is above the fold at 1440×900 (NFR-21)", async ({ page }) => {
  await login(page, "risk@kaptan.demo");
  await expect(page).toHaveURL(/\/approvals$/);
  const approve = page.getByRole("article").getByRole("button", { name: "Onayla", exact: true });
  await expect(approve).toBeVisible();
  const box = await approve.boundingBox();
  expect(box && box.y + box.height).toBeLessThanOrEqual(900);
});
