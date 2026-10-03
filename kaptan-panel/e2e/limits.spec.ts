import { expect, test, type Page } from "@playwright/test";

/** /limits (FRONTEND-SPEC §2.8, US-40): propose → proposer blocked → a different user approves. */
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill("kaptan-demo");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("four-eyes: the Admin proposes, cannot approve, a Risk Officer approves", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await login(page, "admin@kaptan.demo");
  await page.goto("/limits");
  await expect(page.getByRole("heading", { name: "Geçerli sürüm · v1" })).toBeVisible();

  await page.getByRole("button", { name: "Değişiklik öner" }).click();
  const dialog = page.getByRole("dialog", { name: "Limit değişikliği öner" });
  await dialog.locator("#limit-target_concurrent_positions").fill("9");
  await expect(dialog.getByText("1 limit değişecek.")).toBeVisible();
  await dialog.getByRole("textbox", { name: /Gerekçe/ }).fill("Hedef pozisyon sayısını dokuza çıkarma denemesi (test).");
  await dialog.getByRole("button", { name: "Öneriyi gönder (1/2)" }).click();

  await expect(page.getByRole("heading", { name: "v3 · 1 limit değişiyor" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Onayla (2/2)" })).toBeDisabled();
  await expect(page.getByText("Öneren onaylayamaz (dört göz).").first()).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Ana gezinme" }).first();
  await nav.getByRole("group", { name: /Rol değiştir/ }).getByRole("button", { name: "Risk Officer" }).click();
  await expect(nav.getByText("Zeynep (Risk Officer)")).toBeVisible();
  await page.getByRole("button", { name: "Onayla (2/2)" }).click();
  const decide = page.getByRole("dialog", { name: "v3 önerisini onayla" });
  await decide.getByRole("textbox", { name: /Yorum/ }).fill("Dört göz testi: onay.");
  await decide.getByRole("button", { name: "Onayla ve yürürlüğe al" }).click();
  await expect(page.getByRole("heading", { name: "Geçerli sürüm · v3" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the Auditor reads limits but cannot propose", async ({ page }) => {
  await login(page, "denetci@kaptan.demo");
  await page.goto("/limits");
  await expect(page.getByRole("heading", { name: "Geçerli sürüm · v1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Değişiklik öner" })).toBeDisabled();
});
