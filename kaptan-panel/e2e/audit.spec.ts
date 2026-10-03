import { expect, test, type Page } from "@playwright/test";

/** /audit (FRONTEND-SPEC §2.7): chain verify OK, tamper break at #3907, deep links, roles. */
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
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("the Auditor verifies the 4.812-entry chain (read-only, side-effect free)", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "denetci@kaptan.demo");
  await page.goto("/audit");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/denetim kaydı/i);
  await expect(page.getByRole("button", { name: "Kurcalama testi" })).toHaveCount(0);
  await page.getByRole("button", { name: "Zinciri doğrula" }).click();
  await expect(page.getByText("4.812 kayıt · hash zinciri geçerli")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("progressbar", { name: "Doğrulanan kayıt" })).toHaveAttribute("aria-valuenow", "4812");
  expect(errors).toEqual([]);
});

test("the Admin's tamper test breaks the chain at #3.907 and the entry shows why", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "admin@kaptan.demo");
  await page.goto("/audit");
  await page.getByRole("button", { name: "Kurcalama testi" }).click();
  await expect(page.getByText("Kurcalama açık · #3.907")).toBeVisible();
  await page.getByRole("button", { name: "Zinciri doğrula" }).click();
  await expect(page.getByText("Kayıt #3.907'de zincir kırık")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/İçerik değişmiş/)).toBeVisible();
  await page.getByRole("button", { name: /Kırık kayda git/ }).click();
  const drawer = page.getByRole("dialog", { name: "Kayıt #3.907" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/Yeniden hesaplanan hash eşleşmiyor/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Kurcalamayı geri al" }).click();
  await expect(page.getByRole("button", { name: "Kurcalama testi" })).toBeVisible();
  await page.getByRole("button", { name: /^(Zinciri|Yeniden) doğrula$/ }).click();
  await expect(page.getByText("4.812 kayıt · hash zinciri geçerli")).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("deep links land on an entry; the Analyst sees but cannot verify", async ({ page }) => {
  await login(page, "analist@kaptan.demo");
  await page.goto("/audit?pos=4000");
  const drawer = page.getByRole("dialog", { name: "Kayıt #4.000" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/saklanan hash ile eşleşiyor/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Zinciri doğrula" })).toBeDisabled();
  await page.goto("/audit?run=run-day-e2-orncm");
  await expect(page.getByText("run-day-e2-orncm").first()).toBeVisible();
  await expect(page.getByText(/Onay kararı|Öneri oluşturuldu/).first()).toBeVisible();
});
