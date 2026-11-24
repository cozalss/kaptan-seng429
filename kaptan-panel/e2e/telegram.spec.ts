import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginApi, trackErrors } from "./helpers";

/** Ayarlar · Telegram: four steps, the pairing, the level, the message to the phone, and removing the link. */

const TOKEN = "123456789:AAFakeTokenForTestsOnly_0123456789abcd";

async function telegram(page: Page) {
  await loginApi(page);
  await page.goto("/ayarlar");
  await expect(page.getByRole("heading", { level: 2, name: /Telegram/ })).toBeVisible();
}

test("the four steps, a wrong code, then pairing through the link", async ({ page }) => {
  const errors = trackErrors(page);
  await telegram(page);
  const section = page.locator("#telegram");
  await expect(section.getByRole("list", { name: "Telegram’ı bağlamak için dört adım" }).getByRole("listitem")).toHaveCount(4);
  await expect(section.getByRole("link", { name: "BotFather’ı aç" })).toHaveAttribute("href", "https://t.me/BotFather");
  await expect(section.getByRole("button", { name: "Bağla", exact: true })).toBeDisabled();

  await section.getByRole("textbox", { name: "Bot kodu" }).fill("abc");
  await section.getByRole("button", { name: "Kaydet" }).click();
  await expect(section.getByRole("alert")).toContainText("bot kodu gibi görünmüyor");

  await section.getByRole("textbox", { name: "Bot kodu" }).fill(TOKEN);
  await section.getByRole("button", { name: "Kaydet" }).click();
  await expect(section.getByText(/Kaydedildi \(@kaptan_mock_bot\)/)).toBeVisible();
  await expect(section.getByRole("textbox", { name: "Bot kodu" })).toHaveValue(""); // never shown again
  await section.getByRole("button", { name: "Bağla", exact: true }).click();
  const open = section.getByRole("link", { name: "Telegram’da aç" });
  await expect(open).toHaveAttribute("href", /^https:\/\/t\.me\/kaptan_mock_bot\?start=\w{8,}$/);

  await expect(section.getByText(/^Bağlı \(@kaptan_mock_bot\)/)).toBeVisible({ timeout: 15_000 });
  await section.getByRole("radio", { name: "Daha az" }).click();
  await expect(section.getByRole("radio", { name: "Daha az" })).toBeChecked();
  await expect(section.getByText(/Yalnızca elindeki hisselerin/)).toBeVisible();
  await section.getByLabel("Günlük anlık mesaj sınırı").selectOption("5");
  await expect(section.getByText("Günde en fazla 5 anlık mesaj. Fazlası sabah mesajına kalır.")).toBeVisible();

  await page.reload();
  await expect(page.locator("#telegram").getByRole("radio", { name: "Daha az" })).toBeChecked();
  expect(errors).toEqual([]);
});

test("a message to the phone, then removing the link", async ({ page }) => {
  await telegram(page);
  const section = page.locator("#telegram");
  await section.getByRole("textbox", { name: "Bot kodu" }).fill(TOKEN);
  await section.getByRole("button", { name: "Kaydet" }).click();
  await section.getByRole("button", { name: "Bağla", exact: true }).click();
  await expect(section.getByText(/^Bağlı/)).toBeVisible({ timeout: 15_000 });
  await section.getByRole("button", { name: "Telefonuma mesaj gönder" }).click();
  await expect(section.getByRole("status")).toContainText("Mesajı telefonuna gönderdim.");
  await section.getByRole("button", { name: "Bağlantıyı kaldır" }).click();
  await section.getByRole("button", { name: "Evet, kaldır" }).click();
  await expect(section.getByRole("status")).toContainText("Bağlantıyı kaldırdım.");
  await expect(section.getByRole("list", { name: "Telegram’ı bağlamak için dört adım" })).toBeVisible();
  await expect(section.getByRole("button", { name: "Bağla", exact: true })).toBeDisabled();
});

test("no stop wording, and no axe violations in the steps", async ({ page }) => {
  await telegram(page);
  await expect(page.locator("#telegram")).not.toContainText(/durdur/i);
  await page.waitForTimeout(700);
  const result = await new AxeBuilder({ page }).include("#telegram").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
});

/** Bulut takibi: the test double has no .env, so a test turns the cloud on through sessionStorage (mock only). */
const IS_API = process.env.E2E_API === "1";

test("cloud off: three steps folded away, no secret or address anywhere", async ({ page }) => {
  test.skip(IS_API, "the cloud state comes from the server's .env in API mode");
  await telegram(page);
  const off = page.locator("#telegram").getByTestId("cloud-off");
  await expect(off).toBeVisible();
  await off.getByText("Bilgisayar kapalıyken de haber almak ister misin?").click();
  await expect(off.getByRole("list", { name: "Bulut takibini kurmak için üç adım" }).getByRole("listitem")).toHaveCount(3);
  await expect(off).toContainText("kur-bulut.ps1");
  await expect(page.locator("#telegram")).not.toContainText(/workers\.dev|bearer|secret/i);
});

test("cloud on: shows the last sync and the last cloud message, and warns when KAP is blocked", async ({ page }) => {
  test.skip(IS_API, "the cloud state comes from the server's .env in API mode");
  await page.addInitScript(() => {
    window.sessionStorage.setItem("kaptan-mock-cloud", "1");
    window.sessionStorage.setItem("kaptan-mock-cloud-kap", "blocked");
  });
  await telegram(page);
  const on = page.locator("#telegram").getByTestId("cloud-on");
  await expect(on).toContainText("Bulut takibi: açık");
  await expect(on).toContainText("Son eşitleme: 4 dakika önce");
  await expect(on).toContainText("Son bulut mesajı: 3 saat önce");
  await expect(on.getByRole("status")).toContainText("KAP, bulutun adreslerini engelliyor gibi görünüyor");
  await expect(page.locator("#telegram")).not.toContainText("Bilgisayar kapalıyken haber veremem");
  await expect(page.locator("#telegram")).not.toContainText(/workers\.dev|bearer|secret|durdur/i);
  await page.waitForTimeout(700);
  const result = await new AxeBuilder({ page }).include("#telegram").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
});
