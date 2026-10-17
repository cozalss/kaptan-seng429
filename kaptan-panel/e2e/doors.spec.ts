import { expect, test } from "@playwright/test";
import { login, PASSPHRASE, trackErrors, type RoleLabel } from "./helpers";

/** One entrance, four doors: each door opens its own screen and starts the session as that role. */
const DOORS: ReadonlyArray<{ label: RoleLabel; slug: string; verb: string; line: RegExp }> = [
  { label: "Analist", slug: "analist", verb: "OKUR", line: /not düşersin/ },
  { label: "Risk Sorumlusu", slug: "risk", verb: "İMZALAR", line: /Son imzayı sen atarsın\./ },
  { label: "Yönetici", slug: "yonetici", verb: "KURAR", line: /Ekibi, sınırları ve senaryoları sen yönetirsin\./ },
  { label: "Denetçi", slug: "denetci", verb: "GÖZETLER", line: /hiçbir şeye dokunmazsın/ },
];

for (const d of DOORS) {
  test(`the ${d.label} door signs in as ${d.label}`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Hangi kapıdan giriyorsun?" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Roller" }).getByRole("listitem")).toHaveCount(4);
    await login(page, d.label);
    await expect(page.getByRole("button", { name: new RegExp(`^Rol: ${d.label}\.`) }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("each door names the role's verb and describes its link with the door's sentence", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("İlk kez mi? Risk Sorumlusu kapısından gir; son imzayı o atar.", { exact: false })).toBeVisible();
  const doors = page.getByRole("list", { name: "Roller" });
  for (const d of DOORS) {
    const door = doors.getByRole("listitem").filter({ has: page.getByRole("link", { name: d.label, exact: true }) });
    await expect(door.getByText(d.verb, { exact: true })).toBeVisible();
    await expect(door.getByRole("link", { name: d.label, exact: true })).toHaveAccessibleDescription(d.line);
  }
});

test("a door's screen says what the role does and links back to the other doors", async ({ page }) => {
  for (const d of DOORS) {
    await page.goto(`/login/${d.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: d.label })).toBeVisible();
    await expect(page.getByText(d.line).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bu rolle neler yaparsın" })).toBeVisible();
  }
  await page.getByRole("link", { name: /Başka bir rol/ }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("an unknown door is not found, and ?next= is carried through a door", async ({ page }) => {
  const r = await page.goto("/login/kral");
  expect(r?.status()).toBe(404);

  await page.goto("/portfoy");
  await expect(page).toHaveURL(/\/login\?next=%2Fportfoy$/);
  await page.getByRole("link", { name: "Denetçi", exact: true }).click();
  await expect(page).toHaveURL(/\/login\/denetci\?next=%2Fportfoy$/);
  await page.getByLabel("Parola").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Denetçi olarak gir" }).click();
  await expect(page).toHaveURL(/\/portfoy$/);
});

test("the mock API refuses an unknown role at sign-in", async ({ page }) => {
  const r = await page.request.post("/api/mock/session", { data: { passphrase: PASSPHRASE, role: "kral" } });
  expect(r.status()).toBe(400);
  const ok = await page.request.post("/api/mock/session", { data: { passphrase: PASSPHRASE, role: "analyst" } });
  expect((await ok.json()).user.role).toBe("analyst");
});
