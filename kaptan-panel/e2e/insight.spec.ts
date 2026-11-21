import { expect, test } from "@playwright/test";
import { go, loginApi, trackErrors } from "./helpers";

/** Look anything up, follow what you care about: search, the company page, the watchlist, Okunanlar filters. */

test("search finds a company by a Turkish-folded name, opens its page, and starring is remembered", async ({ page }) => {
  const errors = trackErrors(page);
  await loginApi(page);
  await page.goto("/benim");
  await page.keyboard.press("/");
  const box = page.getByRole("searchbox");
  await expect(box).toBeFocused();
  await box.fill("misal yazilim"); // no ı/İ typed: still finds "MİSAL YAZILIM"
  await expect(page.getByRole("link", { name: /Şirket.*YAZILIM/i })).toBeVisible();
  await box.press("Enter");
  await expect(page).toHaveURL(/\/hisse\/ORNYZ$/);

  await expect(page.getByRole("heading", { level: 1 })).toContainText("ORNYZ");
  await expect(page.getByRole("figure")).toBeVisible();
  await page.getByRole("button", { name: "1A" }).click();
  await expect(page.getByRole("button", { name: "1A" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /İzlemeye al/ }).click();
  await expect(page.getByRole("button", { name: /İzliyorsun/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /İzliyorsun/ })).toBeVisible();

  await go(page, "Ana sayfa", /\/benim$/);
  await expect(page.getByRole("region", { name: "İzlediklerim" })).toContainText("ORNYZ");
  expect(errors).toEqual([]);
});

test("Ctrl+K opens the search from anywhere, Escape closes it, an unknown code says so", async ({ page }) => {
  await loginApi(page);
  await page.goto("/portfoy");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("searchbox")).toBeHidden();
  await page.goto("/hisse/QQQQQ");
  await expect(page.getByText("QQQQQ diye bir şirket bulamadım.")).toBeVisible();
});

test("Okunanlar keeps its filters in the address and opens a disclosure in full", async ({ page }) => {
  await loginApi(page);
  await page.goto("/bildirimler?kimler=izlediklerim");
  await expect(page.getByLabel("Hangi şirketler?")).toHaveValue("izlediklerim");
  await page.getByLabel("Hangi şirketler?").selectOption("");
  await expect(page).not.toHaveURL(/kimler=/);
  await page.getByLabel("KAPtan ne sandı?").selectOption("E3");
  await expect(page).toHaveURL(/tur=E3/);
  await page.getByLabel("Yalnız öneri çıkanlar").check();
  await expect(page).toHaveURL(/islem=1/);
  await page.getByRole("button", { name: "Süzgeçleri temizle" }).click();
  await expect(page).not.toHaveURL(/tur=|islem=/);

  await page.getByRole("button", { name: /duyurunun tamamını oku/ }).first().click();
  await expect(page).toHaveURL(/bildirim=\d+/);
  const drawer = page.getByRole("dialog", { name: "Duyurunun tamamı" });
  await expect(drawer.getByText("KAPtan ne sandı?")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/bildirim=/);
});

test("every ticker in Param leads to its company page", async ({ page }) => {
  await loginApi(page);
  await page.goto("/portfoy");
  const held = page.getByRole("list", { name: "Elindekiler" });
  await held.getByRole("link", { name: /şirket sayfası/ }).first().click();
  await expect(page).toHaveURL(/\/hisse\/[A-Z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Sende" })).toBeVisible();
});
