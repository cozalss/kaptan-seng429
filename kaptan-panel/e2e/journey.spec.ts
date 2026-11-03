import { expect, test } from "@playwright/test";
import { resetBackendDemo } from "./backend";
import { go, login, loginApi, mainNav, PASSPHRASE, skipFirstVisit, trackErrors } from "./helpers";

/** The one person's day: sign in, read the home, approve a suggestion, stop everything, restart. */
test.beforeEach(async ({ context }) => {
  await context.clearCookies();
  await resetBackendDemo();
});

test("login → home → approve → sees what to enter → copies → Girdim → it stays honest everywhere", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = trackErrors(page);
  await login(page);

  await expect(page.getByRole("heading", { level: 1, name: /Paran bugün/ })).toBeVisible();
  await expect(page.getByTestId("toplam-para")).toContainText("₺");
  const suggestions = page.getByRole("region", { name: "Öneriler" });
  await expect(suggestions).toBeVisible();

  const approve = suggestions.getByRole("button", { name: /^Onayla: AL / }).first();
  const label = (await approve.getAttribute("aria-label")) ?? "";
  const symbol = label.split(" ").at(-1) ?? "";
  await approve.click();

  // Nothing lets anyone believe the order is done: the object turned into the next step, in place.
  const slip = suggestions.getByRole("group", { name: /^Bankana gireceğin işlem/ }).first();
  await expect(slip).toContainText(symbol);
  await expect(slip.getByRole("heading", { name: "Onayladın. İşlem henüz yapılmadı." })).toBeVisible();
  await expect(slip).toContainText("KAPtan senin yerine işlem yapmaz.");
  await expect(slip).toContainText("uygulamasına sen gir");
  await expect(slip).toContainText("Adet");
  await expect(slip).toContainText("Tanesi en fazla");
  await expect(slip).toContainText("Toplam yaklaşık");
  await expect(slip).toContainText(/içinde gir|açılır/);
  await expect(page.getByTestId("son-islemler")).toContainText(`${symbol} alımını onayladın`);
  await expect(page.getByRole("button", { name: label })).toHaveCount(0);

  // Copy what to type into the bank's app.
  await slip.getByRole("button", { name: "Kopyala" }).click();
  await expect(slip.getByRole("button", { name: /Kopyalandı/ })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`AL ${symbol}`);
  expect(copied).toContain("adet");

  // It is also waiting in Param, the same order.
  await go(page, "Param", /\/portfoy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Param" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Bankana gireceklerin/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /^Bankana gireceğin işlem/ }).first()).toContainText(symbol);

  // Back home it has not gone anywhere; Girdim closes it.
  await go(page, "Ana sayfa", /\/benim$/);
  const waiting = page.getByRole("region", { name: "Öneriler" }).getByRole("group", { name: /^Bankana gireceğin işlem/ }).first();
  await expect(waiting).toContainText(symbol);
  await waiting.getByRole("button", { name: "Girdim" }).click();
  await waiting.getByRole("button", { name: "Kaydet" }).click();
  await expect(waiting.getByRole("heading", { name: "Girdin. Param’a yazıldı." })).toBeVisible();
  await expect(waiting.getByRole("button", { name: "Girdim" })).toHaveCount(0);
  await expect(waiting.getByRole("link", { name: "Param’da gör →" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Geç takes the object away and the next one is the decision; a queued one comes forward", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  const suggestions = page.getByRole("region", { name: "Öneriler" });
  const skip = suggestions.getByRole("button", { name: /^Geç: / }).first();
  const label = (await skip.getAttribute("aria-label")) ?? "";
  await skip.click();
  await expect(page.getByRole("button", { name: label })).toHaveCount(0);
  await expect(suggestions.getByRole("button", { name: /^Onayla: / })).toHaveCount(1);
  await suggestions.getByRole("button", { name: /^Öne al: TUT / }).first().click();
  await suggestions.getByRole("button", { name: /^Onayla: TUT / }).click();
  await expect(suggestions.getByText(/elinde kalıyor\./)).toBeVisible();
  await expect(suggestions.getByRole("group", { name: /^Bankana gireceğin işlem/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a suggestion opens its Neden? page, and Onayla there shows the order to enter", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.getByRole("region", { name: "Öneriler" }).getByRole("link", { name: /^Neden\? AL / }).first().click();
  await expect(page).toHaveURL(/\/oneri\//);
  await expect(page.getByRole("region", { name: "Kararın" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Benzer durumlarda ne oldu?" })).toBeVisible();
  await expect(mainNav(page).getByRole("link", { name: "Ana sayfa" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Onayla", exact: true }).click();
  await expect(page.getByRole("group", { name: /^Bankana gireceğin işlem/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Girdim" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Giremedim asks what happened and closes the order", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.getByRole("region", { name: "Öneriler" }).getByRole("link", { name: /^Neden\? AL / }).first().click();
  await page.getByRole("button", { name: "Onayla", exact: true }).click();
  const slip = page.getByRole("group", { name: /^Bankana gireceğin işlem/ });
  await slip.getByRole("button", { name: "Giremedim" }).click();
  await slip.getByRole("button", { name: "Girdim, gerçekleşmedi" }).click();
  await expect(slip).toContainText("Gerçekleşmedi");
  await expect(page.getByRole("button", { name: "Girdim" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("stop asks first, closes the suggestions, and one press restarts", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.getByRole("button", { name: "Tüm işlemleri durdur" }).click();
  await page.getByRole("dialog", { name: "Tüm işlemler durdurulsun mu?" }).getByRole("button", { name: "Evet, durdur" }).click();

  await expect(page.getByRole("heading", { name: "Tüm işlemler durduruldu" })).toBeVisible();
  await expect(page.getByTestId("stop-state")).toContainText("Elindeki hisseler yerinde duruyor.");
  await expect(page.getByRole("region", { name: "Öneriler" }).getByText(/Yeniden başlatana kadar öneri onaylanamaz/)).toBeVisible();

  // Everywhere else the band says so, with the way to Param.
  await go(page, "Geçmiş", /\/gecmis$/);
  await expect(page.getByTestId("risk-banner")).toContainText("Durduruldu.");
  await go(page, "Param", /\/portfoy$/);
  await expect(page.getByTestId("stop-state")).toBeVisible();

  await page.getByRole("button", { name: "İşlemleri yeniden başlat" }).click();
  await page.getByRole("dialog", { name: "İşlemler yeniden başlasın mı?" }).getByRole("button", { name: "Evet, yeniden başlat" }).click();
  await expect(page.getByTestId("stop-state")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tüm işlemleri durdur" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the password is checked, the app is closed without it, sign-out goes to /login", async ({ page }) => {
  await skipFirstVisit(page);
  await page.goto("/benim");
  await expect(page).toHaveURL(/\/login\?next=%2Fbenim$/);
  await expect(page.getByRole("radiogroup")).toHaveCount(0);

  await page.getByLabel("Parola").fill("yanlis");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Parola" })).toHaveText("Parola doğrulanamadı.");

  await page.getByLabel("Parola").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page).toHaveURL(/\/benim$/);

  await page.getByRole("button", { name: "Hesabım" }).click();
  await page.getByRole("menuitem", { name: "Çıkış" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("every old path goes to the closest screen", async ({ page }) => {
  await loginApi(page);
  for (const [from, to] of [
    ["/bugun", /\/benim$/],
    ["/denetim", /\/gecmis$/],
    ["/inbox", /\/benim$/],
    ["/portfolio", /\/portfoy$/],
    ["/admin", /\/ayarlar$/],
  ] as const) {
    await page.goto(from);
    await expect(page).toHaveURL(to);
  }
  await page.context().clearCookies();
  await page.goto("/login/risk");
  await expect(page).toHaveURL(/\/login$/);
});
