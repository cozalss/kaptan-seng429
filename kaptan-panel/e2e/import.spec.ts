import { expect, test, type Page } from "@playwright/test";
import { loginApi, trackErrors } from "./helpers";

/** Statement import: pick a file, confirm the columns, tick the rows, write; the same file twice adds nothing. */

const CSV = [
  "Tarih;İşlem;Hisse;Adet;Fiyat;Komisyon;Tutar",
  "11.01.2027;Para Yatırma;;;;;50.000,00",
  "11.01.2027;Alış;KRGCL;100;30,00;6,00;",
  "11.01.2027;Virman;;;;;10,00",
].join("\n");

const section = (page: Page) => page.locator("[aria-labelledby=dokum]");

async function upload(page: Page, name: string, body: string) {
  await section(page).getByRole("button", { name: "Dökümünü yükle" }).click();
  await page.locator("input[type=file]").setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(body, "utf-8") });
}

test.describe("Param: statement import", () => {
  test("map, look, tick, write; the second time adds nothing", async ({ page }) => {
    const errors = trackErrors(page);
    await loginApi(page);
    await page.goto("/portfoy");
    const s = section(page);
    await upload(page, "ekstre.csv", CSV);
    await expect(s.getByRole("group", { name: "Sütunları eşleştir" })).toBeVisible();
    await expect(s.getByLabel("Tarih", { exact: true })).toHaveValue("0");
    await s.getByRole("button", { name: "Eşleştirmeyi onayla, satırlara bak" }).click();

    const check = s.getByRole("group", { name: "Satırlara bak" });
    await expect(check.getByRole("heading")).toContainText("2 yeni");
    await expect(check.getByLabel("“virman”")).toBeVisible();
    await check.getByLabel("“virman”").selectOption("skip");
    await expect(check.getByText("11.01.2027: KRGCL 100 adet aldın, tanesi 30,00 ₺.")).toBeVisible();
    await check.getByRole("button", { name: /satırı deftere yaz/ }).click();
    await expect(s.getByRole("status")).toContainText("2 satır deftere yazıldı.");

    await upload(page, "ekstre.csv", CSV);
    await expect(s.getByText("Bu kaynağı daha önce eşleştirmiştin")).toBeVisible();
    await s.getByRole("button", { name: "Eşleştirmeyi onayla, satırlara bak" }).click();
    await expect(s.getByRole("group", { name: "Satırlara bak" }).getByRole("heading")).toContainText("0 yeni, 2 zaten kayıtlı");
    expect(errors).toEqual([]);
  });

  test("a wrong file type is refused in plain words", async ({ page }) => {
    await loginApi(page);
    await page.goto("/portfoy");
    await upload(page, "virus.exe", "MZ");
    await expect(section(page).getByRole("alert")).toContainText("CSV, XLSX ya da yazısı seçilebilen bir PDF seç.");
  });
});
