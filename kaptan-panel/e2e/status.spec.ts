import { expect, test } from "@playwright/test";
import { go, loginApi, mainNav, seedMock, trackErrors, gotoAyarlar } from "./helpers";

/** The part of Ayarlar the person reads to learn whether KAPtan works and can reach them. */
const system = (p: import("@playwright/test").Page) => p.getByRole("region", { name: /^Sistem/ });
const alerts = (p: import("@playwright/test").Page) => p.getByRole("region", { name: /^Bildirimler/ });

test.describe("KAPtan tells the truth about itself", () => {
  test("all is fine: no line in the shell, and Ayarlar says so with the time of the last look", async ({ page }) => {
    const errors = trackErrors(page);
    await seedMock(page, {});
    await loginApi(page);
    await gotoAyarlar(page);
    await expect(system(page).getByText("KAPtan çalışıyor.")).toBeVisible();
    await expect(system(page).getByText(/Son bakış \d\d:\d\d\./)).toBeVisible();
    await expect(page.getByTestId("system-line")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("one problem: one calm line under the top bar, what to do, and Ayrıntı leads to the Sistem block", async ({ page }) => {
    await seedMock(page, { problems: ["ingest_stale"] });
    await loginApi(page);
    await page.goto("/bildirimler");
    const line = page.getByTestId("system-line");
    await expect(line).toContainText("KAPtan şu an bildirim okumuyor.");
    await expect(line).toContainText("kapatıp yeniden aç");
    // A polite live region that never takes focus.
    await expect(page.getByTestId("shell-banner")).toHaveAttribute("role", "status");
    await expect(page.locator(":focus")).not.toHaveAttribute("data-testid", "system-line");
    await line.getByRole("link", { name: /Ayrıntı/ }).click();
    await expect(page).toHaveURL(/\/ayarlar#sistem$/);
    await expect(system(page).getByText("KAPtan’ın bir işi aksıyor.")).toBeVisible();
    // On Ayarlar itself the line has nothing left to point to.
    await expect(page.getByTestId("system-line").getByRole("link")).toHaveCount(0);
  });

  test("several problems: the line names the most important one, Ayarlar lists them all", async ({ page }) => {
    await seedMock(page, { problems: ["agents_down", "backup_stale"] });
    await loginApi(page);
    await gotoAyarlar(page);
    await expect(page.getByTestId("system-line")).toContainText("KAPtan bildirimleri okuyor ama şu an değerlendirmiyor.");
    await expect(page.getByTestId("system-line")).not.toContainText("yedek");
    const list = system(page).getByRole("list", { name: "KAPtan’ın söyledikleri" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list).toContainText("Son yedek 3 gün önce alındı.");
  });
});

test.describe("alerts", () => {
  test("nothing set up: the three plain steps, no test button, desktop alerts off until asked", async ({ page }) => {
    await seedMock(page, {});
    await loginApi(page);
    await gotoAyarlar(page);
    const block = alerts(page);
    await expect(block.getByRole("heading", { name: /Sana henüz haber veremiyorum\./ })).toBeVisible();
    await expect(block.getByRole("list").filter({ hasText: "kur.cmd" }).getByRole("listitem")).toHaveCount(3);
    await expect(block.getByRole("button", { name: "Deneme bildirimi gönder" })).toHaveCount(0);
    await expect(block.getByText("Kapalı.")).toBeVisible();
  });

  test("a phone is set up: the test goes out, and a second press within the minute is answered in words", async ({ page }) => {
    await seedMock(page, { alerts: { ntfy: true } });
    await loginApi(page);
    await gotoAyarlar(page);
    const block = alerts(page);
    await expect(block.getByText("Telefonundaki ntfy uygulamasına bildirim gider.")).toBeVisible();
    await block.getByRole("button", { name: "Deneme bildirimi gönder" }).click();
    await expect(block.getByText(/Deneme bildirimi gönderildi\./)).toBeVisible();
    // One a minute: the second press is answered in plain words, not with a code.
    await block.getByRole("button", { name: "Deneme bildirimi gönder" }).click();
    await expect(block.getByText(/dakikada bir kez/)).toBeVisible();
  });

  test("the test fails: the reason is shown and nothing breaks", async ({ page }) => {
    await seedMock(page, { alerts: { ntfy: true, failing: true } });
    await loginApi(page);
    await gotoAyarlar(page);
    await alerts(page).getByRole("button", { name: "Deneme bildirimi gönder" }).click();
    await expect(alerts(page).getByText("Telefon bildirimi gönderilemedi.")).toBeVisible();
  });

  test("the browser's permission is asked only when the person presses the button", async ({ page }) => {
    await page.addInitScript(() => {
      const calls: string[] = [];
      Object.assign(window, { __asked: calls });
      class FakeNotification {
        static permission: NotificationPermission = "default";
        static requestPermission() {
          calls.push("asked");
          FakeNotification.permission = "granted";
          return Promise.resolve(FakeNotification.permission);
        }
      }
      Object.assign(window, { Notification: FakeNotification });
    });
    await seedMock(page, {});
    await loginApi(page);
    await gotoAyarlar(page);
    await expect(alerts(page).getByText("Kapalı.")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked)).toEqual([]);
    await alerts(page).getByRole("button", { name: /Bu bilgisayarda aç/ }).click();
    await expect(alerts(page).getByText("Açık.")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __asked: string[] }).__asked)).toEqual(["asked"]);
  });
});

test.describe("Okunanlar says what got no turn", () => {
  test("disclosures that waited: the count and the reason", async ({ page }) => {
    await seedMock(page, { deferred: 3, deferredReason: "Bugünkü okuma hakkı doldu; yarın kaldığım yerden devam ederim." });
    await loginApi(page);
    await page.goto("/bildirimler");
    await expect(page.getByText("Bugün 3 bildirime sıra gelmedi.")).toBeVisible();
    await expect(page.getByText(/okuma hakkı doldu/)).toBeVisible();
    await expect(page.getByText(/Başlangıç paranı girene kadar/)).toHaveCount(0);
  });

  test("before the starting money: KAPtan says it does not interpret, with the way to enter it", async ({ page }) => {
    await seedMock(page, { fresh: true });
    await loginApi(page);
    await page.goto("/bildirimler");
    await expect(page.getByText("Başlangıç paranı girene kadar KAPtan bildirimleri yorumlamaz.")).toBeVisible();
    await page.getByRole("link", { name: "Başlangıç paranı gir" }).click();
    await expect(page).toHaveURL(/\/benim$/);
    await go(page, "Okunanlar", /\/bildirimler$/);
    await expect(mainNav(page)).toBeVisible();
  });
});
