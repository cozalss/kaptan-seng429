import { expect, test, type Page } from "@playwright/test";

/**
 * S1 — /runs and /runs/[id] "Neden bu işlem?" (FRONTEND-SPEC §2.4, §7 Adım 2b–2g, 3a, 3b).
 * The demo path: Admin injects the E3 scenario, the graph streams node by node and stops at
 * interrupt() → "Onay bekliyor"; the red-team run never reaches the rule engine; the R04 run
 * is a hard veto with zero LLM calls. Console must stay clean on these screens.
 */
function trackErrors(page: Page): { list: string[]; reset: () => void } {
  const list: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") list.push(m.text());
  });
  page.on("pageerror", (e) => list.push(e.message));
  return { list, reset: () => list.splice(0, list.length) };
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill("kaptan-demo");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await page.waitForURL(/\/(inbox|approvals)$/);
}

async function startScenario(page: Page, runId: string) {
  await page.goto(`/runs/${runId}`);
  await page.getByRole("button", { name: "Senaryoyu başlat" }).click();
}

test("demo path: E3 run streams live, stops at interrupt() and explains itself", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "admin@kaptan.demo");
  errors.reset();

  await startScenario(page, "run-demo-e3-ornek");
  await expect(page.getByRole("heading", { level: 1, name: "Neden bu işlem?" })).toBeVisible();
  await expect(page.getByText("Canlı · graf çalışıyor")).toBeVisible();
  // The graph reaches the human-approval interrupt and the verdict settles.
  await expect(page.getByText("Öneri · onay bekliyor")).toBeVisible({ timeout: 20_000 });
  const path = page.getByRole("navigation", { name: "Karar yolu" });
  await expect(path).toContainText("onay bekliyor");

  // Jury drill-down: TOC jumps to the evidence card and the rule trace.
  await page.getByRole("navigation", { name: "İçindekiler" }).getByRole("link", { name: /Kanıt/ }).click();
  await expect(page).toHaveURL(/#kanit$/);
  await expect(page.getByRole("heading", { level: 2, name: "Kanıt kartı" })).toBeVisible();
  await expect(page.getByText("örnek değer · gerçek sonuç değil").first()).toBeVisible();
  await expect(page.getByText("E3.materiality")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Risk kapısı R01–R16" })).toBeVisible();
  await expect(page.getByText("interrupt()", { exact: true })).toBeVisible();

  // Admin cannot approve (separation of duties): the queue button is disabled with a reason.
  await expect(page.getByRole("button", { name: "Onay kuyruğunda aç" }).first()).toHaveAttribute("aria-disabled", "true");

  // The Risk Officer (role switcher, mock) can go to the queue from here.
  await page.getByRole("button", { name: "Risk Officer" }).click();
  await expect(page.getByRole("link", { name: "Onay kuyruğunda aç" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Emir fişi · kişisel mod" })).toBeVisible();

  expect(errors.list).toEqual([]);
});

test("red-team and R04 runs read differently: quarantine vs hard veto with zero LLM calls", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "admin@kaptan.demo");
  errors.reset();

  await startScenario(page, "run-demo-redteam-dmogd");
  await expect(page.getByText("Karantina · kural motoruna ulaşmadı")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Kural motoruna ulaşmadı: metin karantinada kaldı/)).toBeVisible();
  await expect(page.getByTitle(/Gizli talimat kalıbı/)).toContainText("SİSTEM NOTU");

  await startScenario(page, "run-demo-r04-tmslj");
  await expect(page.getByText("Sert veto · R04 · LLM çağrısı 0")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("SERT VETO · LLM çağrısı 0")).toBeVisible();

  // Both show up in the list; the outcome bar filters to them.
  await page.goto("/runs");
  await page.getByRole("button", { name: /Sert veto/ }).click();
  await expect(page).toHaveURL(/sonuc=PREGATE_VETO/);
  const table = page.getByRole("table", { name: /Çalıştırmalar/ });
  await expect(table.getByText("TMSLJ")).toBeVisible();
  await expect(table.getByText("DMOGD")).toHaveCount(0);
  await table.getByRole("link", { name: "TMSLJ" }).click();
  await expect(page).toHaveURL(/\/runs\/run-demo-r04-tmslj$/);

  expect(errors.list).toEqual([]);
});

test("Auditor reads everything but cannot write a note; unknown run ids say so", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, "denetci@kaptan.demo");
  errors.reset();

  await page.goto("/runs");
  await expect(page.getByRole("heading", { level: 1, name: "Çalıştırmalar" })).toBeVisible();
  await page.getByRole("table", { name: /Çalıştırmalar/ }).getByRole("link", { name: "TMSMK" }).click();
  await expect(page.getByText("Öneri · onaylandı · dolum")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /Not ekle/ })).toBeDisabled();

  await page.goto("/runs/run-yok");
  await expect(page.getByText("Çalıştırma bulunamadı")).toBeVisible();
  expect(errors.list).toEqual([]);
});

test("run screens fit a phone without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "risk@kaptan.demo");
  for (const path of ["/runs", "/runs/run-day-e1-tmsmk"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
