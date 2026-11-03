import { expect, test, type Page } from "@playwright/test";
import { go, loginApi, mainNav, openSettings, PASSPHRASE, trackErrors } from "./helpers";
import { SCREENS } from "./screens";

/**
 * The words nobody who has never traded should meet (brief §4), as whole words or their suffixed
 * forms, and every word that would say this is not the real thing (brief §5c).
 */
const BANNED =
  /(?<!\p{L})(analist|risk sorumlusu|risk officer|admin|denetçi|auditor|ekip|takım|masa|üye|rol|ikinci imza|iki imza|dört göz|onay zinciri|kişisel mod|tek kullanıcı|gelişmiş görünüm|sharpe|rag|p95|drawdown|kill switch|escalate|emir fişi|seans\p{L}*|lot|limit fiyat|portföy\p{L}*|denetim\p{L}*|ders projesi|yatırım tavsiyesi|üye \d|deneme\p{L}*|demo\p{L}*|örnek\p{L}*|benzetim\p{L}*|simüle\p{L}*|simülasyon\p{L}*|kurgusal|temsili)(?!\p{L})/giu;

/** The grandmother test on what is on screen, with every folded detail opened first. */
async function expectPlain(page: Page) {
  await page.locator("details").evaluateAll((els) => els.forEach((d) => d.setAttribute("open", "")));
  const text = await page.locator("body").innerText();
  const labels = await page.locator("[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? "").join("\n"));
  const found = [...`${text}\n${labels}`.matchAll(BANNED)].map((m) => m[0]);
  expect([...new Set(found)]).toEqual([]);
}

test("every screen opens from the nav, and the account menu holds Ayarlar", async ({ page }) => {
  const errors = trackErrors(page);
  await loginApi(page);
  await page.goto("/benim");
  await expect(mainNav(page).getByRole("link")).toHaveText(["Ana sayfa", "Param", "Okunanlar", "Geçmiş"]);

  await go(page, "Param", /\/portfoy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Param" })).toBeVisible();
  await go(page, "Okunanlar", /\/bildirimler$/);
  await expect(page.getByRole("heading", { level: 1, name: "Okunanlar" })).toBeVisible();
  await go(page, "Geçmiş", /\/gecmis$/);
  await expect(page.getByRole("heading", { level: 1, name: "Geçmiş" })).toBeVisible();
  await go(page, "Ana sayfa", /\/benim$/);
  await openSettings(page);
  await expect(page.getByRole("heading", { level: 1, name: "Ayarlar" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Kayıtlar sağlam mı? walks the chain and says yes; Ayarlar has no way to tamper with it", async ({ page }) => {
  await loginApi(page);
  await page.goto("/gecmis");
  await page.getByRole("button", { name: "Kayıtlar sağlam mı?" }).click();
  await expect(page.getByTestId("walk-result")).toContainText("Kayıtlar sağlam.", { timeout: 15_000 });
  await expectPlain(page);

  await openSettings(page);
  await expect(page.getByRole("list", { name: "Geçerli sınırlar" })).toBeVisible();
  await expect(page.getByRole("button", { name: /kurcala|senaryo|sıfırla/i })).toHaveCount(0);
});

test("a login page never shows or suggests a password", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Parola")).toBeVisible();
  await expect(page.getByText(PASSPHRASE)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Doldur" })).toHaveCount(0);
  await expectPlain(page);
});

test("first visit: KAPtan nasıl çalışır opens once, is skippable, and comes back from Ayarlar", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Parola").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "KAPtan okur." });
  await expect(dialog).toBeVisible();
  await expectPlain(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "Sen karar verirsin." })).toContainText("asla alıp satmaz");
  await page.getByRole("button", { name: "Anladım" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.reload();
  await expect(mainNav(page)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await openSettings(page);
  await page.getByRole("button", { name: "Yeniden göster" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Param while stopped: what it says has no banned word either", async ({ page }) => {
  await loginApi(page);
  await page.goto("/portfoy");
  await page.getByRole("button", { name: "Tüm işlemleri durdur" }).click();
  await page.getByRole("dialog", { name: "Tüm işlemler durdurulsun mu?" }).getByRole("button", { name: "Evet, durdur" }).click();
  await expect(page.getByTestId("stop-state")).toBeVisible();
  await expectPlain(page);
});

for (const s of SCREENS) {
  test(`${s.path}: fits a 360 px phone, and its text has no banned word`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await loginApi(page);
    await page.goto(s.path);
    await s.ready(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await expectPlain(page);
  });
}
