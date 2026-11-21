import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginApi, PASSPHRASE, trackErrors } from "./helpers";

/** Settings that fit the person's life: pause, alerts, backup, look and feel, help, shortcuts, password. */

async function sections(page: Page) {
  await loginApi(page);
  await page.goto("/ayarlar");
  await expect(page.getByRole("heading", { level: 2, name: /Tatil modu/ })).toBeVisible();
}

test("Tatil modu: pause, the home says so with the way back, resume", async ({ page }) => {
  const errors = trackErrors(page);
  await sections(page);
  await page.getByRole("button", { name: "7 gün ara ver" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Tatil modu açık\. Bitiş: / })).toBeVisible();

  await page.goto("/benim");
  const notice = page.getByRole("region", { name: "Tatil modu" });
  await expect(notice).toContainText("öneri getirmiyor");
  await notice.getByRole("button", { name: "Şimdi devam et" }).click();
  await expect(notice).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Tatil modu: a date more than 90 days away is refused in plain words", async ({ page }) => {
  await sections(page);
  const button = page.getByRole("button", { name: "Ara ver", exact: true });
  // The field may be filled before the page has hydrated: try until the button knows about it.
  await expect(async () => {
    await page.getByLabel("Ya da şu tarihte devam etsin").fill("2030-01-01");
    await expect(button).toBeEnabled({ timeout: 500 });
  }).toPass();
  await button.click();
  await expect(page.getByRole("status").filter({ hasText: "En fazla 90 gün" })).toBeVisible();
});

test("alert preferences are saved at once and still there after a reload", async ({ page }) => {
  await sections(page);
  const phone = page.getByRole("checkbox", { name: "İzlediğin şirket: telefon ve e-posta" });
  await expect(phone).toBeChecked();
  await phone.uncheck();
  await expect(page.getByText("Kaydedildi.")).toBeVisible();
  await page.getByRole("checkbox", { name: "Sessiz saatler" }).check();
  await expect(page.getByLabel("Başlangıç")).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "İzlediğin şirket: telefon ve e-posta" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Sessiz saatler" })).toBeChecked();
});

test("Şimdi yedek al shows the request and then the result", async ({ page }) => {
  await sections(page);
  await page.getByRole("button", { name: "Şimdi yedek al" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Yedek (isteğin alındı|alınıyor)/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Yedek hazır." })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 2, name: /Son yedek .* tarihinde alındı/ })).toBeVisible();
});

test("the look is remembered and set before the page paints", async ({ page }) => {
  await sections(page);
  await page.getByLabel("Koyu", { exact: true }).check();
  await page.getByLabel("Çok büyük", { exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-text", "xlarge");

  // On a new load the attributes are there at "commit", before any script of the app has run.
  await page.goto("/ayarlar", { waitUntil: "commit" });
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark" && document.documentElement.dataset.text === "xlarge");
  await expect(page.getByLabel("Koyu", { exact: true })).toBeChecked();
  const paper = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--paper").trim());
  expect(paper).toBe("#0b0f1d");

  await page.getByLabel("Açık", { exact: true }).check();
  await page.getByLabel("Normal", { exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).not.toHaveAttribute("data-text", /.+/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--paper").trim())).toBe("#eef0f4");
  await page.getByLabel("Cihaz gibi", { exact: true }).check(); // back to following the device: nothing is forced
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
});

for (const [theme, text] of [["Açık", "Çok büyük"], ["Koyu", "Çok büyük"]] as const) {
  test(`no sideways scroll and no axe violations at 360 px, ${theme}, ${text}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await loginApi(page);
    await page.goto("/ayarlar");
    await expect(page.getByRole("heading", { level: 2, name: /Tatil modu/ })).toBeVisible();
    await page.getByLabel(theme, { exact: true }).check();
    await page.getByLabel(text, { exact: true }).check();
    for (const path of ["/ayarlar", "/yardim", "/benim"]) {
      await page.goto(path);
      await page.waitForTimeout(900);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
    }
    await page.goto("/ayarlar");
    await page.waitForTimeout(900);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  });
}

test("Yardım: questions, the glossary search, and a ne demek? link that lands on its word", async ({ page }) => {
  await sections(page);
  await page.getByRole("link", { name: "Yedek ne demek?" }).click();
  await expect(page).toHaveURL(/\/yardim#sozluk-yedek$/);
  await expect(page.locator("#sozluk-yedek")).toBeFocused();
  await expect(page.locator("#sozluk-yedek")).toContainText("Kayıtlarının bilgisayarının dışında");

  await page.getByText("Param nerede?").click();
  await expect(page.getByText("KAPtan para tutmaz ve para taşımaz")).toBeVisible();
  await page.getByLabel("Kelime ara").fill("komisyon");
  await expect(page.locator("#sozluk-komisyon")).toBeVisible();
  await expect(page.locator("#sozluk-zirve")).toHaveCount(0);
  await page.getByLabel("Kelime ara").fill("yokböylebirkelime");
  await expect(page.getByText("Bu kelimeyi bulamadım.")).toBeVisible();
});

test("Yardım is in the account menu and on the 404 page", async ({ page }) => {
  await loginApi(page);
  await page.goto("/benim");
  await page.getByRole("button", { name: "Hesabım" }).click();
  await page.getByRole("menuitem", { name: "Yardım" }).click();
  await expect(page).toHaveURL(/\/yardim$/);
  await page.goto("/boyle-bir-sayfa-yok");
  await page.getByRole("link", { name: "Yardım’a bak" }).click();
  await expect(page).toHaveURL(/\/yardim$/);
});

test("keyboard: ? lists the shortcuts, g and a letter move between screens, typing is left alone", async ({ page }) => {
  await loginApi(page);
  await page.goto("/benim");
  await expect(page.getByRole("region", { name: "Öneriler" })).toBeVisible();
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Klavye kısayolları" });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  for (const [letter, url] of [["y", /\/ayarlar$/], ["p", /\/portfoy$/], ["o", /\/bildirimler$/], ["g", /\/gecmis$/], ["a", /\/benim$/]] as const) {
    await page.keyboard.press("g");
    await page.keyboard.press(letter);
    await expect(page).toHaveURL(url);
  }

  await page.goto("/yardim");
  await page.getByLabel("Kelime ara").click();
  await page.keyboard.type("gy?");
  await expect(page.getByLabel("Kelime ara")).toHaveValue("gy?");
  await expect(page).toHaveURL(/\/yardim$/);
});

test("the password: refused with a plain line when wrong, changed when right, and sign out everywhere", async ({ page }) => {
  await sections(page);
  await page.getByLabel("Şimdiki parolan").fill("yanlış-parola");
  await page.getByLabel("Yeni parolan", { exact: true }).fill("yeni-parolam");
  await page.getByLabel("Yeni parolayı bir daha yaz").fill("yeni-parolam");
  await page.getByRole("button", { name: "Parolayı değiştir" }).click();
  await expect(page.getByText("Şimdiki parolan doğru değil.")).toBeVisible();
  await page.getByLabel("Şimdiki parolan").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Parolayı değiştir" }).click();
  await expect(page.getByText("Parolan değişti.")).toBeVisible();

  await page.getByRole("button", { name: "Her yerden çıkış yap" }).click();
  await page.getByRole("button", { name: "Evet, her yerden çık" }).click();
  await expect(page).toHaveURL(/\/login/);
});
