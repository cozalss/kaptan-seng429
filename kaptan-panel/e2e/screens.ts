import { expect, type Page } from "@playwright/test";

/** Every signed-in screen, and how to tell its data has loaded. */
export const SCREENS: ReadonlyArray<{ path: string; ready: (p: Page) => Promise<void> }> = [
  { path: "/benim", ready: (p) => expect(p.getByRole("region", { name: "Öneriler" })).toBeVisible() },
  { path: "/oneri/prop-day-e1-krgcl", ready: (p) => expect(p.getByRole("region", { name: "Kararın" })).toBeVisible() },
  { path: "/portfoy", ready: (p) => expect(p.getByRole("list", { name: "Elindekiler" })).toBeVisible() },
  { path: "/bildirimler", ready: (p) => expect(p.getByRole("group", { name: "Bildirim listesi" })).toBeVisible() },
  { path: "/gecmis", ready: (p) => expect(p.getByRole("list", { name: "Geçmiş kayıtları" })).toBeVisible() },
  { path: "/ayarlar", ready: (p) => expect(p.getByRole("list", { name: "Geçerli sınırlar" })).toBeVisible() },
];
