import { expect, test } from "@playwright/test";
import { IS_API } from "./backend";
import { accountRadio, login, PASSPHRASE, trackErrors, type RoleLabel } from "./helpers";

/** One sign-in screen, four team accounts: the chosen account decides the session's role. */
const ACCOUNTS: ReadonlyArray<{ label: RoleLabel; slug: string; person: RegExp }> = [
  { label: "Analist", slug: "analist", person: /Üye 2/ },
  { label: "Risk Sorumlusu", slug: "risk", person: /Üye 3/ },
  { label: "Yönetici", slug: "yonetici", person: /Üye 1/ },
  { label: "Denetçi", slug: "denetci", person: /Jüri/ },
];

for (const a of ACCOUNTS) {
  test(`the ${a.label} account signs in as ${a.label}`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "KAPtan Paneli" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Hesap" }).getByRole("radio")).toHaveCount(4);
    await login(page, a.label);
    await expect(page.getByRole("button", { name: new RegExp(`^Rol: ${a.label}\\.`) })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("each account shows its role and person; Risk Sorumlusu is chosen first", async ({ page }) => {
  await page.goto("/login");
  for (const a of ACCOUNTS) {
    await expect(accountRadio(page, a.label)).toHaveAccessibleName(new RegExp(`^${a.label} ${a.person.source}`));
  }
  await expect(accountRadio(page, "Risk Sorumlusu")).toBeChecked();
  // The passphrase hint is a mock-only courtesy; against the API the passphrase is never on the page.
  await expect(page.getByText(PASSPHRASE, { exact: true })).toHaveCount(IS_API ? 0 : 1);
});

test("/login/<rol> opens the same screen with that account chosen", async ({ page }) => {
  for (const a of ACCOUNTS) {
    await page.goto(`/login/${a.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: "KAPtan Paneli" })).toBeVisible();
    await expect(accountRadio(page, a.label)).toBeChecked();
  }
});

test("a wrong passphrase says so and keeps you on the screen", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Parola").fill("yanlis");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Parola" })).toHaveText("Parola doğrulanamadı.");
  await expect(page.getByLabel("Parola")).toBeFocused();
  await expect(page).toHaveURL(/\/login$/);
});

test("an unknown account is not found, and ?next= is carried through sign-in", async ({ page }) => {
  const r = await page.goto("/login/kral");
  expect(r?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Sayfa bulunamadı." })).toBeVisible();

  await page.goto("/portfoy");
  await expect(page).toHaveURL(/\/login\?next=%2Fportfoy$/);
  await accountRadio(page, "Denetçi").check();
  await page.getByLabel("Parola").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page).toHaveURL(/\/portfoy$/);
  await expect(page.getByRole("button", { name: /^Rol: Denetçi\./ })).toBeVisible();
});

test("the API refuses an unknown role at sign-in", async ({ page }) => {
  // Mock: the in-panel session route. http: POST /api/v1/auth/login through the Next rewrite.
  const url = IS_API ? "/api/v1/auth/login" : "/api/mock/session";
  const r = await page.request.post(url, { data: { passphrase: PASSPHRASE, role: "kral" } });
  expect(r.status()).toBe(400);
  const ok = await page.request.post(url, { data: { passphrase: PASSPHRASE, role: "analyst" } });
  expect((await ok.json()).user.role).toBe("analyst");
});
