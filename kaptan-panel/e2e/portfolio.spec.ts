import { expect, test, type Page } from "@playwright/test";

/**
 * /portfolio — demo step 4 (11 §2, FRONTEND-SPEC §7): the loss simulation stops new orders at
 * −1 %, fires the kill switch at −5,21 % drawdown, and the reset needs two people
 * (Admin starts 1/2, Risk Officer confirms 2/2). Plus a role denial and a clean console.
 */
function trackErrors(page: Page): { errors: string[]; arm: () => void } {
  const errors: string[] = [];
  let armed = false;
  page.on("console", (m) => {
    if (armed && m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => {
    if (armed) errors.push(e.message);
  });
  return { errors, arm: () => (armed = true) };
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill("kaptan-demo");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function confirm(page: Page, opts: { comment: string; phrase: string; totp?: string }) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /gerekçe/i }).fill(opts.comment);
  if (opts.totp) await dialog.getByLabel(/Doğrulama kodu/).fill(opts.totp);
  await dialog.getByLabel(/Onaylamak için/).fill(opts.phrase);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();
}

test("demo step 4: loss simulation → daily stop → kill switch → four-eyes reset", async ({ page }) => {
  test.setTimeout(90_000);
  const { errors, arm } = trackErrors(page);
  await login(page, "admin@kaptan.demo");
  arm();
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { name: "Risk durumu" })).toBeVisible();
  await expect(page.getByTestId("kill-state")).toHaveText("KAPALI");

  await page.getByRole("button", { name: "Zarar simülasyonu" }).click();

  // Day stops at −1 %: the ochre band, nobody can lift it.
  await expect(page.getByText("YENİ EMİR DURDU").first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/Gün içinde kaldırılamaz/)).toBeVisible();

  // Then the kill switch fires at −5,21 % drawdown from peak.
  await expect(page.getByTestId("kill-state")).toHaveText("AÇIK", { timeout: 10_000 });
  await expect(page.getByTestId("drawdown-value")).toContainText("5,21");
  await expect(page.getByText("KILL SWITCH AÇIK").first()).toBeVisible();
  await expect(page.getByText("çıkış kuralıyla yönetiliyor").first()).toBeVisible();
  await expect(page.getByText("Kill switch açıldı")).toBeVisible();

  // 1/2 — Admin starts the reset (type-to-confirm + step-up code).
  await page.getByRole("button", { name: "Sıfırlamayı başlat" }).click();
  await confirm(page, { comment: "Zarar simülasyonu incelendi", phrase: "SIFIRLA", totp: "000000" });
  await expect(page.getByTestId("reset-pending")).toContainText("Risk Officer onayı gerekiyor (1/2)");
  await expect(page.getByRole("button", { name: "Sıfırlamayı onayla" })).toBeDisabled();

  // 2/2 — a different person, the Risk Officer, confirms (mock role switcher keeps the session state).
  await page.getByRole("group", { name: "Rol değiştir (demo)" }).getByRole("button", { name: "Risk Officer" }).click();
  await expect(page.getByRole("button", { name: "Sıfırlamayı onayla" })).toBeEnabled({ timeout: 10_000 });
  await page.getByRole("button", { name: "Sıfırlamayı onayla" }).click();
  await confirm(page, { comment: "İkinci göz: onaylandı", phrase: "ONAYLA", totp: "000000" });
  await expect(page.getByTestId("kill-state")).toHaveText("KAPALI");
  await expect(page.getByText("Sıfırlama onaylandı (2/2)").first()).toBeVisible();
  // The daily −1 % stop is not lifted by the reset.
  await expect(page.getByText("YENİ EMİR DURDU").first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("the Risk Officer engages the kill switch only after typing DURDUR", async ({ page }) => {
  await login(page, "risk@kaptan.demo");
  await page.goto("/portfolio");
  await page.getByRole("button", { name: "Kill switch'i aç" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /gerekçe/i }).fill("Manuel durdurma testi");
  await dialog.getByLabel(/Onaylamak için/).fill("DUR");
  await expect(dialog.locator('button[type="submit"]')).toBeDisabled();
  await dialog.getByLabel(/Onaylamak için/).fill("DURDUR");
  await dialog.locator('button[type="submit"]').click();
  await expect(page.getByTestId("kill-state")).toHaveText("AÇIK");
  await expect(page.getByRole("button", { name: "Sıfırlamayı başlat" })).toBeDisabled();
});

test("the Analyst sees the kill switch but cannot use it", async ({ page }) => {
  await login(page, "analist@kaptan.demo");
  await page.goto("/portfolio");
  await expect(page.getByRole("button", { name: "Kill switch'i aç" })).toBeDisabled();
  await expect(page.getByText(/yalnızca Risk Officer veya Admin açabilir/)).toBeVisible();
});

test("personal-mode ticket, eval and brief render cleanly", async ({ page }) => {
  const { errors, arm } = trackErrors(page);
  await login(page, "denetci@kaptan.demo");
  arm();
  await page.goto("/portfolio?sekme=fis");
  await expect(page.getByText(/T-2027-0111-003/)).toBeVisible();
  await expect(page.getByText(/LİMİT 48,40 TL · 620 lot/)).toBeVisible();

  await page.goto("/eval");
  await expect(page.getByTestId("sample-stamp")).toHaveText("örnek değer · gerçek sonuç değil");
  await expect(page.getByRole("heading", { name: "Holdout olay çalışması" })).toBeVisible();

  await page.goto("/brief");
  await expect(page.getByRole("heading", { level: 1, name: "Sabah özeti" })).toBeVisible();
  await expect(page.getByText("LLM üretimi, doğrulanmamış")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/portfolio", "/eval", "/brief"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});
