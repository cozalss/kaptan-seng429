import { expect, test, type Page } from "@playwright/test";
import { go, loginApi, seedMock, trackErrors } from "./helpers";

/** The person's own money: the first question, Param's money section, and the order's bank step. */

const startField = (p: Page) => p.getByRole("textbox", { name: "Başlangıç paran" });

async function startWith(page: Page, amount: string) {
  await startField(page).fill(amount);
  await page.getByRole("button", { name: "Bu parayla başla" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Elinde zaten hisse var mı?" })).toBeVisible();
}

async function fillHolding(page: Page, ticker: string, qty: string, cost: string) {
  await page.getByLabel("Hisse kodu").fill(ticker);
  await page.getByLabel("Kaç adet?").fill(qty);
  await page.getByLabel("Tanesini kaç liradan aldın?").fill(cost);
  await page.getByLabel("Ne zaman aldın?").fill("2027-01-04");
}

test.describe("first run: the one question", () => {
  test("a new install asks for the money, then takes you home with it", async ({ page }) => {
    const errors = trackErrors(page);
    await seedMock(page, { fresh: true });
    await loginApi(page);
    await page.goto("/benim");
    await expect(page.getByRole("heading", { level: 1, name: "Ne kadar parayla başlıyorsun?" })).toBeVisible();

    // Nothing typed: one plain line, and the cursor stays on the field.
    await page.getByRole("button", { name: "Bu parayla başla" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Bir tutar yaz." })).toBeVisible();

    // The amount is read back in words, so a slipped zero shows before anything is sent.
    await startField(page).fill("25000");
    await expect(startField(page)).toHaveValue("25.000");
    await expect(page.getByText("Yirmi beş bin lira.")).toBeVisible();

    await startWith(page, "25000");
    await page.getByRole("button", { name: "Hayır, ana sayfaya geç" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^Paran hazır|^Senin hisselerinde bugün/ })).toBeVisible();
    await expect(page.getByTestId("toplam-para")).toContainText("25.000");
    expect(errors).toEqual([]);
  });

  test("a share you already hold is optional, and joins Param at what you paid", async ({ page }) => {
    const errors = trackErrors(page);
    await seedMock(page, { fresh: true });
    await loginApi(page);
    await page.goto("/benim");
    await startWith(page, "50000");

    await page.getByRole("button", { name: "Evet, hisse ekleyeyim" }).click();
    await page.getByRole("button", { name: "Hisseyi ekle" }).click();
    await expect(page.getByText("Hisse kodunu yaz; 3 ile 6 harf.")).toBeVisible();

    await fillHolding(page, "ZZZZZ", "10", "250,5");
    await page.getByRole("button", { name: "Hisseyi ekle" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Bu hisse kodunu tanımıyorum." })).toBeVisible();

    await page.getByLabel("Hisse kodu").fill("KRGCL");
    await page.getByRole("button", { name: "Hisseyi ekle" }).click();
    await expect(page.getByText("KRGCL eklendi: 10 adet.")).toBeVisible();

    await page.getByRole("button", { name: "Tamam, ana sayfaya geç" }).click();
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Elinde zaten hisse var mı?");
    await go(page, "Param", /\/portfoy$/);
    await expect(page.getByRole("list", { name: "Elindekiler" })).toContainText("Koru Çelik");
    await expect(page.getByRole("list", { name: "Elindekiler" })).toContainText("10 adet");
    expect(errors).toEqual([]);
  });

  test("Param without any money sends you to the question instead of showing zeros", async ({ page }) => {
    await seedMock(page, { fresh: true });
    await loginApi(page);
    await page.goto("/portfoy");
    await expect(page.getByRole("heading", { level: 1, name: "Önce başlangıç paranı yaz." })).toBeVisible();
    await page.getByRole("link", { name: "Başlangıç paramı yazayım" }).click();
    await expect(page).toHaveURL(/\/benim$/);
    await expect(page.getByRole("heading", { level: 1, name: "Ne kadar parayla başlıyorsun?" })).toBeVisible();
  });
});

test.describe("Param: your money", () => {
  test("adding money, withdrawing too much (the server's sentence), withdrawing, and the movements", async ({ page }) => {
    const errors = trackErrors(page);
    await loginApi(page);
    await page.goto("/portfoy");
    const section = page.getByRole("region", { name: /koydun\.$/ });
    await expect(section).toBeVisible();

    await section.getByRole("button", { name: "Para ekle", exact: true }).click();
    await section.getByRole("textbox", { name: "Ne kadar ekliyorsun?" }).fill("1000");
    await section.getByRole("button", { name: "Parayı ekle" }).click();
    await expect(section.getByRole("status")).toHaveText("1.000 ₺ ekledin.");
    await expect(section.getByRole("list").first()).toContainText("1.000 ₺ ekledin.");

    await section.getByRole("button", { name: "Para çek", exact: true }).click();
    const field = section.getByRole("textbox", { name: "Ne kadar çekiyorsun?" });
    await field.fill("99999999");
    await section.getByRole("button", { name: "Parayı çek" }).click();
    await expect(section.getByRole("alert").filter({ hasText: "Elindeki nakitten fazlasını çekemezsin." })).toBeVisible();

    await field.fill("200");
    await section.getByRole("button", { name: "Parayı çek" }).click();
    await expect(section.getByRole("status")).toHaveText("200 ₺ çektin.");
    await expect(section.getByRole("list").first()).toContainText("200 ₺ çektin.");
    // Focus returns to the button that opened the form.
    await expect(section.getByRole("button", { name: "Para çek", exact: true })).toBeFocused();
    expect(errors).toEqual([]);
  });

  test("a share you already hold: add it, then say you sold part of it, with and without the bank's commission", async ({ page }) => {
    const errors = trackErrors(page);
    await loginApi(page);
    await page.goto("/portfoy");
    const section = page.getByRole("region", { name: /koydun\.$/ });
    await section.getByRole("button", { name: "Elindeki bir hisseyi ekle", exact: true }).click();
    await fillHolding(page, "KRGCL", "10", "30");
    await section.getByRole("button", { name: "Hisseyi ekle", exact: true }).click();
    await expect(section.getByRole("status")).toHaveText("KRGCL eklendi: 10 adet.");
    await expect(section.getByRole("list").first()).toContainText("Zaten elinde olan bir hisseyi ekledin");

    const sell = page.getByRole("button", { name: "KRGCL: sattım" });
    await sell.click();
    await page.getByLabel("Kaç adet sattın?").fill("99");
    await page.getByLabel("Tanesini kaç liradan sattın?").fill("35");
    await page.getByRole("button", { name: "Satışı kaydet" }).click();
    await expect(page.getByText("Elinde 10 adet var; fazlasını satamazsın.")).toBeVisible();

    await page.getByLabel("Kaç adet sattın?").fill("4");
    await page.getByRole("button", { name: "Satışı kaydet" }).click();
    await expect(page.getByText("Satışı yazdım: 4 adet. 6 adet kaldı. Komisyonu yazmadın; KAPtan tahmin etti.")).toBeVisible();

    await page.getByRole("button", { name: "KRGCL: sattım" }).click();
    await page.getByLabel("Kaç adet sattın?").fill("6");
    await page.getByLabel("Tanesini kaç liradan sattın?").fill("36");
    await page.getByLabel("Bankan ne kadar komisyon kesti?").fill("5");
    await page.getByRole("button", { name: "Satışı kaydet" }).click();
    await expect(page.getByText("Satışı yazdım: hepsi satıldı. Para nakde geçti.")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("the order's bank step", () => {
  /** Approve the first AL suggestion on the home; returns the slip that waits for the bank. */
  async function approveFirstBuy(page: Page) {
    await page.goto("/benim");
    const suggestions = page.getByRole("region", { name: "Öneriler" });
    await suggestions.getByRole("button", { name: /^Onayla: AL / }).first().click();
    const slip = suggestions.getByRole("group", { name: /^Bankana gireceğin işlem/ }).first();
    await expect(slip).toBeVisible();
    return slip;
  }

  test("with the bank's commission the slip says what the bank charged", async ({ page }) => {
    const errors = trackErrors(page);
    await loginApi(page);
    const slip = await approveFirstBuy(page);
    await slip.getByRole("button", { name: "Girdim" }).click();
    await slip.getByLabel("Adet").fill("2");
    await slip.getByLabel("Bankan ne kadar komisyon kesti?").fill("12,5");
    await slip.getByRole("button", { name: "Girdiğimi kaydet" }).click();
    await expect(slip.getByRole("heading", { name: "Girdin. Param’a yazıldı." })).toBeVisible();
    await expect(slip.getByTestId("komisyon")).toHaveText("Bankanın kestiği komisyon: 12,50 ₺.");
    expect(errors).toEqual([]);
  });

  test("without it the slip says the commission is an estimate", async ({ page }) => {
    await loginApi(page);
    const slip = await approveFirstBuy(page);
    await slip.getByRole("button", { name: "Girdim" }).click();
    await slip.getByLabel("Adet").fill("2");
    await slip.getByRole("button", { name: "Girdiğimi kaydet" }).click();
    await expect(slip.getByTestId("komisyon")).toContainText("Komisyonu yazmadın; KAPtan tahmin etti:");
  });

  test("a fill written after the order's time is accepted, because the book must match the bank", async ({ page }) => {
    const errors = trackErrors(page);
    // Only the test double's clock moves: 45 minutes pass after the approval.
    await page.addInitScript(() => {
      const real = Date.now.bind(Date);
      Date.now = () => real() + ((window as unknown as { __skew?: number }).__skew ?? 0);
    });
    await loginApi(page);
    const slip = await approveFirstBuy(page);
    await page.evaluate(() => {
      (window as unknown as { __skew: number }).__skew = 45 * 60_000;
    });
    await expect(slip.getByText(/Süresi doldu, yeni girme/)).toBeVisible();
    await slip.getByRole("button", { name: "Girdim" }).click();
    await slip.getByLabel("Adet").fill("1");
    await slip.getByRole("button", { name: "Girdiğimi kaydet" }).click();
    await expect(slip.getByRole("heading", { name: "Girdin. Param’a yazıldı." })).toBeVisible();
    await expect(slip).toContainText("Süresi dolduktan sonra girdin; yine de Param’a yazıldı");
    expect(errors).toEqual([]);
  });
});
