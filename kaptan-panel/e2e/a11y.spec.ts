import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginApi, seedMock, type MockSeed, gotoAyarlar, visit } from "./helpers";
import { SCREENS } from "./screens";

async function expectNoViolations(page: Page) {
  await page.waitForTimeout(700); // let entry animations settle (contrast is measured on final colours)
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const summary = result.violations.map((v) => `${v.impact ?? "?"} ${v.id} ×${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}

/** WCAG 2.2 A/AA (axe-core) on every screen, after its data has loaded, from the smallest phone to desktop. */
for (const width of [320, 390, 1440]) {
  test.describe(`axe @${width}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    });

    test("/login", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByLabel("Parola")).toBeVisible();
      await expectNoViolations(page);
    });

    test("404", async ({ page }) => {
      await loginApi(page);
      await page.goto("/boyle-bir-sayfa-yok");
      await expect(page.getByRole("heading", { level: 1, name: "Sayfa bulunamadı." })).toBeVisible();
      await expectNoViolations(page);
    });

    for (const s of SCREENS) {
      test(s.path, async ({ page }) => {
        await loginApi(page);
        await visit(page, s.path);
        await s.ready(page);
        await expectNoViolations(page);
      });
    }
  });
}

/** Param's insight blocks in their busiest state: the limit tightened (warning sentence) and a note editor open. */
async function openInsights(page: Page) {
  const where = page.getByRole("region", { name: /Paranın en büyük parçası|tek hissede/ });
  await where.getByLabel("Uyarı çizgisi: tek hissede paranın yüzde kaçı olunca sana söyleyeyim?").fill("5");
  await where.getByRole("button", { name: "Uyarı çizgisini kaydet" }).click();
  await expect(where.getByRole("status")).toHaveText("Sınırın %5 oldu.");
  const notes = page.getByRole("region", { name: /not yazabilirsin|not yazmışsın/ });
  await notes.getByRole("button", { name: /için not yaz/ }).first().click();
  await expect(notes.getByLabel("Neden aldın, ne zaman satmayı düşünüyorsun?")).toBeVisible();
}

/** The honest-state surfaces: a problem line, the Sistem and Bildirimler blocks, what got no turn. */
const STATES: ReadonlyArray<{ name: string; path: string; seed: MockSeed; ready: (p: Page) => Promise<void> }> = [
  { name: "one problem, line + Sistem", path: "/ayarlar", seed: { problems: ["ingest_stale"] }, ready: (p) => expect(p.getByTestId("system-line")).toBeVisible() },
  { name: "several problems", path: "/ayarlar", seed: { problems: ["agents_down", "backup_stale"] }, ready: (p) => expect(p.getByRole("list", { name: "KAPtan’ın söyledikleri" })).toBeVisible() },
  { name: "alerts set up", path: "/ayarlar", seed: { alerts: { ntfy: true } }, ready: (p) => expect(p.getByRole("button", { name: "Deneme bildirimi gönder" })).toBeVisible() },
  { name: "line on Okunanlar", path: "/bildirimler", seed: { problems: ["ingest_stale"], deferred: 3, deferredReason: "Bugünkü okuma hakkı doldu." }, ready: (p) => expect(p.getByText("Bugün 3 bildirime sıra gelmedi.")).toBeVisible() },
  { name: "waiting for money", path: "/bildirimler", seed: { fresh: true }, ready: (p) => expect(p.getByText(/Başlangıç paranı girene kadar/)).toBeVisible() },
  { name: "first run, the question", path: "/benim", seed: { fresh: true }, ready: (p) => expect(p.getByRole("heading", { level: 1, name: "Ne kadar parayla başlıyorsun?" })).toBeVisible() },
  { name: "first run, the question with its error", path: "/benim", seed: { fresh: true }, ready: firstRunError },
  { name: "first run, the optional share", path: "/benim", seed: { fresh: true }, ready: firstRunHolding },
  { name: "Param before any money", path: "/portfoy", seed: { fresh: true }, ready: (p) => expect(p.getByRole("heading", { level: 1, name: "Önce başlangıç paranı yaz." })).toBeVisible() },
  { name: "set up, nothing owned: home", path: "/benim", seed: { fresh: true }, ready: setUpNothingOwned },
  { name: "Param, money in", path: "/portfoy", seed: {}, ready: openDeposit },
  { name: "Param, a sale with errors", path: "/portfoy", seed: {}, ready: openSaleWithError },
  { name: "Önemli duyurular, the day", path: "/onemli", seed: {}, ready: (p) => expect(p.getByRole("heading", { level: 1 })).toContainText("Önemli duyurular") },
  { name: "Takvim, the dates ahead", path: "/takvim", seed: {}, ready: (p) => expect(p.getByRole("heading", { level: 1 })).toContainText("Takvim") },
  { name: "Karne, the month", path: "/gecmis/karne", seed: {}, ready: (p) => expect(p.getByTestId("track-summary")).toBeVisible() },
  { name: "Karne, the year", path: "/gecmis/karne", seed: {}, ready: karneYear },
  { name: "the bank step with the commission field", path: "/benim", seed: {}, ready: openBankStep },
  { name: "Param, the starting money row being corrected", path: "/portfoy", seed: {}, ready: openMoneyCorrection },
  { name: "Param, the start-over confirmation", path: "/portfoy", seed: {}, ready: openStartOver },
  { name: "Param, the one-share limit warning and a note being written", path: "/portfoy", seed: {}, ready: openInsights },
  { name: "Ayarlar, my commission rate", path: "/ayarlar", seed: {}, ready: (p) => expect(p.getByRole("textbox", { name: "Binde kaç?" })).toBeVisible() },
  { name: "the slip with a fill being fixed", path: "/benim", seed: {}, ready: openFillFix },
  { name: "Ayarlar, price alerts and the backup list", path: "/ayarlar", seed: {}, ready: (p) => expect(p.getByRole("list", { name: "Yedekler" })).toBeVisible() },
  { name: "the weekly summary", path: "/gecmis/hafta", seed: {}, ready: (p) => expect(p.getByTestId("hafta-kaptan")).toBeVisible() },
];

async function karneYear(p: Page) {
  await p.getByRole("button", { name: "Yıl", exact: true }).click();
  await expect(p.getByRole("heading", { level: 1 })).toContainText(/\d{4} döneminde/);
}
async function startMoney(p: Page) {
  await p.getByRole("textbox", { name: "Başlangıç paran" }).fill("25000");
  await p.getByRole("button", { name: "Bu parayla başla" }).click();
  await expect(p.getByRole("heading", { level: 1, name: "Elinde zaten hisse var mı?" })).toBeVisible();
}
async function firstRunError(p: Page) {
  await p.getByRole("button", { name: "Bu parayla başla" }).click();
  await expect(p.getByRole("alert").filter({ hasText: "Bir tutar yaz." })).toBeVisible();
}
async function firstRunHolding(p: Page) {
  await startMoney(p);
  await p.getByRole("button", { name: "Evet, hisse ekleyeyim" }).click();
  await p.getByRole("button", { name: "Hisseyi ekle", exact: true }).click();
  await expect(p.getByText("Hisse kodunu yaz; 3 ile 6 harf.")).toBeVisible();
}
async function setUpNothingOwned(p: Page) {
  await startMoney(p);
  await p.getByRole("button", { name: "Hayır, ana sayfaya geç" }).click();
  await expect(p.getByRole("heading", { level: 1, name: /^Paran hazır|^Senin hisselerinde bugün/ })).toBeVisible();
}
async function openDeposit(p: Page) {
  await p.getByRole("button", { name: "Para ekle", exact: true }).click();
  await p.getByRole("textbox", { name: "Ne kadar ekliyorsun?" }).fill("1250");
  await expect(p.getByText("Bin iki yüz elli lira.")).toBeVisible();
}
async function openSaleWithError(p: Page) {
  await p.getByRole("button", { name: "Elindeki bir hisseyi ekle", exact: true }).click();
  await p.getByLabel("Hisse kodu").fill("KRGCL");
  await p.getByLabel("Kaç adet?").fill("10");
  await p.getByLabel("Tanesini kaç liradan aldın?").fill("30");
  await p.getByLabel("Ne zaman aldın?").fill("2027-01-04");
  await p.getByRole("button", { name: "Hisseyi ekle", exact: true }).click();
  await p.getByRole("button", { name: "KRGCL: sattım" }).click();
  await p.getByLabel("Kaç adet sattın?").fill("99");
  await p.getByRole("button", { name: "Satışı kaydet" }).click();
  await expect(p.getByText("Elinde 10 adet var; fazlasını satamazsın.")).toBeVisible();
}
async function openMoneyCorrection(p: Page) {
  const row = p.locator("[data-movement]").filter({ hasText: "ile başladın" });
  await row.getByRole("button", { name: /Başlangıç parasını değiştir/ }).click();
  await expect(p.getByRole("textbox", { name: "Başlangıç paran ne kadardı?" })).toBeVisible();
}
async function openStartOver(p: Page) {
  await p.getByRole("button", { name: "Baştan başla" }).click();
  await expect(p.getByText("Eski defter silinmez")).toBeVisible();
}
async function openFillFix(p: Page) {
  const suggestions = p.getByRole("region", { name: "Öneriler" });
  await suggestions.getByRole("button", { name: /^Onayla: AL / }).first().click();
  const slip = suggestions.getByRole("group", { name: /^Bankana gireceğin işlem/ }).first();
  await slip.getByRole("button", { name: "Girdim" }).click();
  await slip.getByLabel("Adet").fill("2");
  await slip.getByRole("button", { name: "Girdiğimi kaydet" }).click();
  await slip.getByRole("button", { name: "Yanlış yazdım, düzelteyim" }).click();
  await expect(slip.getByRole("form", { name: "Girdiğini düzelt" })).toBeVisible();
}
async function openBankStep(p: Page) {
  const suggestions = p.getByRole("region", { name: "Öneriler" });
  await suggestions.getByRole("button", { name: /^Onayla: AL / }).first().click();
  const slip = suggestions.getByRole("group", { name: /^Bankana gireceğin işlem/ }).first();
  await slip.getByRole("button", { name: "Girdim" }).click();
  await slip.getByLabel("Adet").fill("0");
  await slip.getByRole("button", { name: "Girdiğimi kaydet" }).click();
  await expect(slip.getByText("Adedi tam sayı olarak yaz.")).toBeVisible();
}

for (const width of [360, 1440]) {
  test.describe(`axe states @${width}`, () => {
    for (const st of STATES) {
      test(st.name, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
        await seedMock(page, st.seed);
        await loginApi(page);
        await visit(page, st.path);
        await st.ready(page);
        await expectNoViolations(page);
      });
    }
  });
}

/** Company actions (wave 4): the KAP prompt with its form open on Param. */
for (const width of [360, 1440]) {
  test(`axe corporate prompt and form @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await loginApi(page);
    await page.goto("/portfoy");
    const money = page.getByRole("region", { name: /koydun\.$/ });
    await money.getByRole("button", { name: "Elindeki bir hisseyi ekle", exact: true }).click();
    await page.getByLabel("Hisse kodu").fill("KRGCL");
    await page.getByLabel("Kaç adet?").fill("100");
    await page.getByLabel("Tanesini kaç liradan aldın?").fill("30");
    await page.getByLabel("Ne zaman aldın?").fill("2027-01-04");
    await money.getByRole("button", { name: "Hisseyi ekle", exact: true }).click();
    const corp = page.getByRole("region", { name: /kâr payı/ });
    await corp.getByRole("button", { name: "KRGCL: yazayım" }).first().click();
    await expect(corp.getByRole("form", { name: "Kâr payı geldi" })).toBeVisible();
    // Scoped to this section: other screens' own findings (the holding rows' links) are theirs.
    await page.waitForTimeout(700);
    const result = await new AxeBuilder({ page }).include("[aria-labelledby=kar-payi]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  });
}

/** Statement import (wave 5): the column step and the row step on Param. */
for (const width of [360, 1440]) {
  test(`axe statement import @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await loginApi(page);
    await page.goto("/portfoy");
    const s = page.locator("[aria-labelledby=dokum]");
    await s.getByRole("button", { name: "Dökümünü yükle" }).click();
    const csv = "Tarih;İşlem;Hisse;Adet;Fiyat;Komisyon;Tutar\n11.01.2027;Alış;KRGCL;100;30,00;6,00;\n11.01.2027;Virman;;;;;10,00";
    await page.locator("input[type=file]").setInputFiles({ name: "ekstre.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });
    await expect(s.getByRole("group", { name: "Sütunları eşleştir" })).toBeVisible();
    const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
    let result = await new AxeBuilder({ page }).include("[aria-labelledby=dokum]").withTags(tags).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    await s.getByRole("button", { name: "Eşleştirmeyi onayla, işlemlere bak" }).click();
    await expect(s.getByRole("group", { name: "İşlemlere bak" })).toBeVisible();
    result = await new AxeBuilder({ page }).include("[aria-labelledby=dokum]").withTags(tags).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  });
}

/** Wave 6 (SIGNAL): the home strip, the triage buttons on Okunanlar and the reading drawer, light and dark. */
for (const width of [360, 1440]) {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`axe signal @${width} ${scheme}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
        await page.emulateMedia({ colorScheme: scheme });
        await seedMock(page, {});
        await loginApi(page);
      });

      test("the home strip", async ({ page }) => {
        await page.goto("/benim");
        await expect(page.getByTestId("senin-hisselerinde").locator("[data-signal-index]").first()).toBeVisible();
        await expectNoViolations(page);
      });

      test("Okunanlar, important list with a state chosen and the filters open", async ({ page }) => {
        await page.goto("/bildirimler");
        const list = page.getByTestId("onemli-liste");
        await list.getByRole("button", { name: "Yapılacak" }).first().click();
        await page.getByTestId("filtreler").getByText("Filtreler ve günün özeti").click();
        await expectNoViolations(page);
      });

      test("the reading drawer with the signal and the triage buttons", async ({ page }) => {
        await page.goto("/benim");
        await page.getByTestId("senin-hisselerinde").getByRole("link", { name: /duyuruyu aç/ }).first().click();
        await expect(page.getByRole("dialog", { name: "Duyurunun tamamı" }).getByTestId("drawer-signal")).toBeVisible();
        await expectNoViolations(page);
      });
    });
  }
}

/** Wave 6 (TELEGRAM): Ayarlar · Telegram with the link waiting and connected, light and dark. */
for (const width of [360, 1440]) {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`axe telegram @${width} ${scheme}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
        await page.emulateMedia({ colorScheme: scheme });
        await loginApi(page);
        await gotoAyarlar(page);
        await expect(page.locator("#telegram")).toBeVisible();
      });

      test("the steps, the link waiting for the phone", async ({ page }) => {
        const s = page.locator("#telegram");
        await s.getByRole("textbox", { name: "Bot kodu" }).fill("123456789:AAFakeTokenForTestsOnly_0123456789abcd");
        await s.getByRole("button", { name: "Kaydet" }).click();
        await s.getByRole("button", { name: "Bağla", exact: true }).click();
        await expect(s.getByRole("link", { name: "Telegram’da aç" })).toBeVisible();
        await expectNoViolations(page);
      });

      test("connected, with the level and the buttons", async ({ page }) => {
        const s = page.locator("#telegram");
        await s.getByRole("textbox", { name: "Bot kodu" }).fill("123456789:AAFakeTokenForTestsOnly_0123456789abcd");
        await s.getByRole("button", { name: "Kaydet" }).click();
        await s.getByRole("button", { name: "Bağla", exact: true }).click();
        await expect(s.getByText(/^Bağlı/)).toBeVisible({ timeout: 15_000 });
        await expectNoViolations(page);
      });

      test("cloud watcher on, with a warning", async ({ page }) => {
        test.skip(process.env.E2E_API === "1", "the cloud state comes from the server's .env in API mode");
        await page.addInitScript(() => {
          window.sessionStorage.setItem("kaptan-mock-cloud", "1");
          window.sessionStorage.setItem("kaptan-mock-cloud-kap", "blocked");
        });
        await gotoAyarlar(page);
        await expect(page.locator("#telegram").getByTestId("cloud-on")).toBeVisible();
        await expectNoViolations(page);
      });

      test("cloud watcher off, setup steps open", async ({ page }) => {
        test.skip(process.env.E2E_API === "1", "the cloud state comes from the server's .env in API mode");
        const off = page.locator("#telegram").getByTestId("cloud-off");
        await off.getByText("Bilgisayar kapalıyken de haber almak ister misin?").click();
        await expect(off.getByRole("list", { name: "Bulut takibini kurmak için üç adım" })).toBeVisible();
        await expectNoViolations(page);
      });
    });
  }
}

/** The home (redesign): axe from the smallest phone to desktop, light and dark, with the morning brief open. */
for (const width of [320, 390, 768, 1440]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`axe home @${width} ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await seedMock(page, {});
      await loginApi(page);
      await page.goto("/benim");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByTestId("senin-hisselerinde").locator("[data-signal-index]").first()).toBeVisible();
      await page.getByRole("button", { name: "Sabah özetini aç" }).click();
      await expect(page.getByTestId("bu-sabah")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expectNoViolations(page);
    });
  }
}
