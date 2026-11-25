import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginApi, openFolds, trackErrors } from "./helpers";

/** Ayarlar in four plain groups, and "Ayarları sıfırla". */

const GROUPS = ["Telefon ve bildirimler", "Param ve sınırlar", "Görünüm", "Hesap ve yedek"] as const;
const group = (page: Page, name: string) => page.getByRole("region", { name });

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
}

test("four groups, each with one line of what is set now and its details folded", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginApi(page);
  await page.goto("/ayarlar");
  for (const name of GROUPS) await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  const notify = page.getByTestId("ozet-telefon-bildirim");
  await expect(notify).toContainText("Telegram bağlı değil");
  await expect(notify).toContainText("Masaüstü bildirimleri");
  await expect(notify).toContainText("Sessiz saat yok");
  await expect(page.getByTestId("ozet-gorunum")).toHaveText("Tema: Cihaz gibi · Yazı: Normal");
  await expect(page.getByTestId("ozet-para-sinir")).toContainText("sınır seni koruyor");
  // The details are folded: no limits list, no password form.
  await expect(page.getByRole("list", { name: "Geçerli sınırlar" })).toBeHidden();
  // Each summary is in the first screen of a phone.
  for (const id of ["telefon-bildirim", "para-sinir", "gorunum", "hesap-yedek"]) {
    const box = await page.getByTestId(`ozet-${id}`).boundingBox();
    expect(box && box.y + box.height, id).toBeLessThan(844);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Param ve sınırlar: değiştir" }).click();
  await expect(page.getByRole("list", { name: "Geçerli sınırlar" })).toBeVisible();
  await page.getByRole("button", { name: "Param ve sınırlar: kapat" }).click();
  await expect(page.getByRole("list", { name: "Geçerli sınırlar" })).toBeHidden();

  // Rarely used things sit under "Gelişmiş".
  await page.getByRole("button", { name: "Telefon ve bildirimler: değiştir" }).click();
  await expect(page.getByRole("heading", { name: /Bildirim geçmişi/ })).toBeHidden();
  await openFolds(page);
  await expect(page.getByRole("heading", { name: /Bildirim geçmişi/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("an old link such as #sistem opens the group it points into", async ({ page }) => {
  await loginApi(page);
  await page.goto("/ayarlar#sistem");
  await expect(page.locator("#sistem")).toBeVisible();
});

test("wide screen: a sticky list of the groups, and the reset card at the end", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginApi(page);
  await page.goto("/ayarlar");
  const anchors = page.getByRole("navigation", { name: "Ayarlar bölümleri" });
  await expect(anchors).toBeVisible();
  await anchors.getByRole("link", { name: "Param ve sınırlar" }).click();
  await expect(page.getByRole("list", { name: "Geçerli sınırlar" })).toBeVisible();
  await expect(page.locator("#sifirla")).toContainText("paran ve kayıtların değişmez");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(anchors).toBeHidden(); // on a phone the groups are the list
});

test("Ayarları sıfırla: asks first, says what stays, then puts the settings back", async ({ page }) => {
  const errors = trackErrors(page);
  await loginApi(page);
  await page.goto("/ayarlar");
  // Make a mess: dark theme, big text, quiet hours, a pause, a muted company.
  await page.getByRole("button", { name: "Görünüm: değiştir" }).click();
  await page.getByLabel("Koyu", { exact: true }).check();
  await page.getByLabel("Çok büyük", { exact: true }).check();
  await page.getByRole("button", { name: "Telefon ve bildirimler: değiştir" }).click();
  await page.getByRole("checkbox", { name: "Sessiz saatler" }).check();
  await expect(page.getByTestId("ozet-telefon-bildirim")).toContainText("Sessiz saatler 22:00–08:00");
  await page.getByRole("button", { name: "7 gün ara ver" }).click();
  await expect(page.getByTestId("ozet-telefon-bildirim")).toContainText("Tatil modu açık");
  await page.getByRole("textbox", { name: "Hangi şirket?" }).first().fill("THYAO");
  await page.getByRole("button", { name: "Sustur", exact: true }).click();
  await expect(page.getByTestId("ozet-telefon-bildirim")).toContainText("1 şirket susturuldu");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await group(page, "Telefon ve bildirimler").getByTestId("reset-open").click();
  const dialog = page.getByRole("dialog", { name: "Ayarları sıfırlayayım mı?" });
  await expect(dialog).toContainText("Susturduğun şirketler");
  await expect(dialog).toContainText("Tatil modu");
  await expect(dialog).toContainText("Telegram bağlı kalır");
  await expect(dialog).toContainText("paran, elindeki hisseler, kayıp sınırların, parolan, geçmiş, Telegram bağlantın ve yedeklerin");
  await expect(dialog).toContainText("bildirim iznini bir site geri alamaz");
  // Not yet: "Vazgeç" changes nothing.
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(page.getByTestId("ozet-telefon-bildirim")).toContainText("Tatil modu açık");

  await group(page, "Telefon ve bildirimler").getByTestId("reset-open").click();
  await page.getByRole("dialog").getByRole("button", { name: "Evet, sıfırla" }).click();
  await expect(page.getByTestId("reset-notice")).toHaveText("Ayarlar varsayılana döndü.");
  const summary = page.getByTestId("ozet-telefon-bildirim");
  await expect(summary).toContainText("Sessiz saat yok");
  await expect(summary).not.toContainText("Tatil modu");
  await expect(summary).not.toContainText("susturuldu");
  await expect(page.getByTestId("ozet-gorunum")).toHaveText("Tema: Cihaz gibi · Yazı: Normal");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  await expect(page.locator("html")).not.toHaveAttribute("data-text", /.+/);

  // One row in Geçmiş.
  await page.goto("/gecmis");
  await expect(page.getByText("Ayarları varsayılana döndürdün.").first()).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [360, 1440]) {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`axe Ayarlar groups @${width} ${scheme}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width, height: width < 500 ? 800 : 900 });
        await page.emulateMedia({ colorScheme: scheme });
        await loginApi(page);
        await page.goto("/ayarlar");
        await expect(page.getByRole("heading", { level: 2, name: "Hesap ve yedek" })).toBeVisible();
      });

      test("folded", async ({ page }) => {
        expect(await violations(page)).toEqual([]);
      });

      test("every fold open, and the reset dialog", async ({ page }) => {
        await openFolds(page);
        expect(await violations(page)).toEqual([]);
        await group(page, "Görünüm").getByTestId("reset-open").click();
        await expect(page.getByRole("dialog")).toBeVisible();
        expect(await violations(page)).toEqual([]);
      });
    });
  }
}
