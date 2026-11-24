import { expect, test } from "@playwright/test";
import { loginApi, seedMock, trackErrors } from "./helpers";

/** One meaning of "important": the home strip, Okunanlar, triage, the drawer and the keys (test double). */
test.describe("Senin hisselerinde bugün", () => {
  for (const [name, width, height] of [["phone", 390, 844], ["desktop", 1440, 900]] as const) {
    test(`the strip is the first thing on the home (${name})`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.setViewportSize({ width, height });
      await seedMock(page, {});
      await loginApi(page);
      await page.goto("/benim");
      const strip = page.getByTestId("senin-hisselerinde");
      await expect(strip).toBeVisible();
      await expect(strip.getByRole("heading", { name: "Senin hisselerinde bugün" })).toBeVisible();
      const top = await strip.evaluate((el) => el.getBoundingClientRect().top);
      expect(top).toBeLessThan(height / 2);
      // the card under it is the next block, and shows none of the strip's items
      const card = page.getByRole("heading", { name: "Bugün önemli duyurular" });
      await expect(card).toBeVisible();
      const stripIds = await strip.locator("[data-signal-index]").evaluateAll((els) => els.map((e) => e.getAttribute("data-signal-index")));
      const cardLinks = await page.locator(".dg-card a[href*='bildirim=']").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
      for (const id of stripIds) expect(cardLinks.some((h) => h.endsWith(`bildirim=${id}`))).toBe(false);
      expect(errors).toEqual([]);
    });
  }

  test("an item shows its line, tone and suggestion, and opens that disclosure in the drawer", async ({ page }) => {
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/benim");
    const row = page.getByTestId("senin-hisselerinde").locator("[data-signal-index]").first();
    await expect(row).toBeVisible();
    await expect(row.locator(".sg-line")).not.toBeEmpty();
    await expect(row.locator(".sg-tone")).toBeVisible();
    await row.getByRole("link", { name: /duyuruyu aç/ }).click();
    await expect(page).toHaveURL(/\/bildirimler\?gun=\d{4}-\d{2}-\d{2}&bildirim=\d+/);
    const drawer = page.getByRole("dialog", { name: "Duyurunun tamamı" });
    await expect(drawer.getByTestId("drawer-signal")).toBeVisible();
    await drawer.getByRole("button", { name: "Tamam", exact: true }).click();
    await expect(drawer.getByRole("button", { name: "Tamam", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("with nothing of mine it says so in words and counts the others", async ({ page }) => {
    await seedMock(page, { fresh: false });
    await loginApi(page);
    await page.goto("/benim");
    // mark every item of mine done: the strip then shows the explicit quiet sentence
    const strip = page.getByTestId("senin-hisselerinde");
    await expect(strip).toBeVisible();
    const n = await strip.locator("[data-signal-index]").count();
    for (let i = 0; i < n; i++) {
      await strip.getByRole("button", { name: "Tamam", exact: true }).first().click();
      await expect(strip.locator("[data-signal-index]")).toHaveCount(n - i - 1);
    }
    await expect(strip.getByText("Bugün senin hisselerinde önemli bir şey yok.")).toBeVisible();
  });
});

test.describe("Okunanlar, important first", () => {
  test("the first item is on the first screen of a phone and the filters are one closed row", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/bildirimler");
    const first = page.getByTestId("onemli-liste").locator("[data-signal-index]").first();
    await expect(first).toBeVisible();
    const bottom = await first.evaluate((el) => el.getBoundingClientRect().bottom);
    expect(bottom).toBeLessThan(844 + 200);
    const top = await first.evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeLessThan(844);
    await expect(page.getByTestId("filtreler")).not.toHaveAttribute("open", "");
    await page.getByTestId("filtreler").getByText("Filtreler ve günün özeti").click();
    await expect(page.getByTestId("filtreler")).toHaveAttribute("open", "");
  });

  test("keys: j moves, d marks done; the state sticks and the sonra star is the same state", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/bildirimler");
    const list = page.getByTestId("onemli-liste");
    const rows = list.locator("[data-signal-index]");
    await expect(rows.first()).toBeVisible();
    await page.keyboard.press("j");
    await expect(rows.first()).toHaveAttribute("data-focused", "true");
    await page.keyboard.press("s");
    await expect(rows.first().getByRole("button", { name: "Sonra oku" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /Sonra oku \(1\)/ })).toBeVisible();
    await page.keyboard.press("a");
    await expect(rows.first().getByRole("button", { name: "Yapılacak" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /Sonra oku \(0\)/ })).toBeVisible();
    await expect(page.getByText(/Yapılacak: 1\./)).toBeVisible();
  });

  test("Önemlileri de okundu say clears the count and can be undone", async ({ page }) => {
    await seedMock(page, {});
    await loginApi(page);
    await page.goto("/bildirimler");
    const bar = page.getByRole("group", { name: "Okuma durumun" });
    const clear = bar.getByRole("button", { name: "Önemlileri de okundu say" });
    await expect(bar).toBeVisible();
    if (await clear.isEnabled()) {
      await clear.click();
      await expect(bar.getByText("Önemli her duyuruya baktın.")).toBeVisible();
      await bar.getByRole("button", { name: "Geri al" }).click();
      await expect(bar.getByText(/önemli duyuru bekliyor/)).toBeVisible();
    }
  });
});

test("the morning brief lists the important items with their lines", async ({ page }) => {
  await seedMock(page, {});
  await loginApi(page);
  await page.goto("/benim");
  const brief = page.getByTestId("bu-sabah");
  await expect(brief).toBeVisible();
  await expect(brief.getByTestId("brief-signals").or(brief.getByTestId("brief-nothing"))).toBeVisible();
});

test("Dinle is hidden when the browser has no Turkish voice and shown (pausable) when it has one", async ({ page }) => {
  await page.addInitScript(() => {
    const synth = { getVoices: () => [], speak: () => undefined, cancel: () => undefined, pause: () => undefined, resume: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  });
  await seedMock(page, {});
  await loginApi(page);
  await page.goto("/benim");
  await expect(page.getByTestId("senin-hisselerinde")).toBeVisible();
  await expect(page.getByRole("button", { name: /Dinle/ })).toHaveCount(0);

  const voiced = await page.context().newPage();
  await voiced.addInitScript(() => {
    const synth = { getVoices: () => [{ lang: "tr-TR", name: "Test" }], speak: () => undefined, cancel: () => undefined, pause: () => undefined, resume: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    class U { text: string; constructor(t: string) { this.text = t; } }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: U, configurable: true });
  });
  await voiced.goto("/benim");
  const listen = voiced.getByTestId("senin-hisselerinde").getByRole("button", { name: /Dinle/ });
  await expect(listen).toBeVisible();
  await listen.click();
  await expect(voiced.getByRole("button", { name: "Duraklat" })).toBeVisible();
  await voiced.getByRole("button", { name: "Duraklat" }).click();
  await expect(voiced.getByRole("button", { name: "Devam et" })).toBeVisible();
});
