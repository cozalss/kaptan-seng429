import { expect, test } from "@playwright/test";
import { loginApi, trackErrors } from "./helpers";

/** Reading marks (saved, unread), the company page's numbers and the two-company compare. */

test("a duyuru can be saved for later, found under Kaydedilenler and taken off again", async ({ page }) => {
  const errors = trackErrors(page);
  await loginApi(page);
  await page.goto("/bildirimler");
  const bar = page.getByRole("group", { name: "Okuma durumun" });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("button", { name: /Kaydedilenler \(0\)/ })).toBeVisible();

  await page.getByRole("button", { name: /sonra okumak için kaydet/ }).first().click();
  await expect(bar.getByRole("button", { name: /Kaydedilenler \(1\)/ })).toBeVisible();

  await bar.getByRole("button", { name: /Kaydedilenler/ }).click();
  const saved = page.getByRole("group", { name: "Kaydedilen duyurular" });
  await expect(saved).toBeVisible();
  await saved.getByRole("button", { name: /işareti kaldır/ }).click();
  await expect(page.getByText("Henüz bir şey kaydetmedin.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Hepsini okundu say clears the unread count in the bar and the badge", async ({ page }) => {
  await loginApi(page);
  await page.goto("/bildirimler");
  const bar = page.getByRole("group", { name: "Okuma durumun" });
  await expect(bar).toBeVisible();
  const clear = bar.getByRole("button", { name: "Hepsini okundu say" });
  if (await clear.isEnabled()) await clear.click();
  await expect(bar.getByText("Şirketlerindeki her duyuruyu gördün.")).toBeVisible();
  await expect(page.getByText(/okunmamış duyuru/)).toHaveCount(0);
});

test("the company page shows the price numbers, the BIST 100 comparison and the insider strip", async ({ page }) => {
  const errors = trackErrors(page);
  await loginApi(page);
  await page.goto("/hisse/ORNEK");
  await expect(page.getByText("Yılın en düşüğü")).toBeVisible();
  await expect(page.getByText("Son günün hacmi")).toBeVisible();
  await page.getByRole("button", { name: "BIST 100 ile karşılaştır" }).click();
  await expect(page.getByRole("img", { name: /BIST 100/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Yönetici alımları ve geri alım" })).toBeVisible();
  await page.getByRole("link", { name: /Başka bir hisseyle karşılaştır/ }).click();
  await expect(page).toHaveURL(/\/karsilastir\?a=ORNEK/);
  expect(errors).toEqual([]);
});

test("two companies side by side: lines, numbers, and the same code twice is refused", async ({ page }) => {
  await loginApi(page);
  await page.goto("/karsilastir?a=ORNEK&b=ORNCM&donem=1y");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ORNEK ile ORNCM yan yana.");
  await expect(page.getByRole("img", { name: /ORNEK.*ORNCM/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Son kapanış/ })).toBeVisible();
  await page.getByLabel("İkinci şirket").selectOption("ORNEK");
  await expect(page.getByText("İki farklı şirket seç.")).toBeVisible();
});
