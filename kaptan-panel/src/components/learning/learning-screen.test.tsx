import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/types";
import { mockApi, renderWithApi } from "@/components/solo/money.test-utils";
import { LearningSection } from "@/components/settings/learning-section";
import { LearningScreen } from "./learning-screen";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const BANNED = /kalibrasyon|walk-forward|\bbps\b|Sharpe|seans|holdout/i;

describe("Ne öğrendim", () => {
  it("opens with the takeaway, then every kind with its net figures and how well the guesses held", async () => {
    renderWithApi(<LearningScreen />, mockApi({ fresh: false }));
    const e1 = await screen.findByTestId("tur-E1");
    expect(screen.getByRole("heading", { level: 1 }).textContent?.replace(/ /g, " ")).toContain("geri alım eşiğini %0,25'ten %0,20'ye indirdi");
    expect(e1).toHaveTextContent("Geri alım");
    expect(e1).toHaveTextContent("96 olay · 20 borsa günü sonra");
    expect(e1).toHaveTextContent("Sonucu belli olan karar: 4 / 30.");
    expect(screen.getByRole("heading", { name: "2022'den öğrendi, 2023'te denedi" })).toBeInTheDocument();
    expect(screen.getByText("452 olayda düz ortalamadan %2,0 daha az yanıldı.")).toBeInTheDocument();
    expect(document.body.textContent?.match(BANNED)?.[0] ?? null).toBeNull();
  });

  it("undoes a change with Geri al and shows it as undone", async () => {
    const u = userEvent.setup({ delay: null });
    renderWithApi(<LearningScreen />, mockApi({ fresh: false }));
    const change = await screen.findByTestId("degisiklik-2");
    expect(change).toHaveTextContent("+0,4 puan (+0,1 ile +0,8 puan arası), 212 olay");
    await u.click(within(change).getByRole("button", { name: /Geri al/ }));
    expect(await within(screen.getByTestId("degisiklik-2")).findByText("Geri alındı")).toBeInTheDocument();
    expect(within(screen.getByTestId("degisiklik-2")).queryByRole("button")).toBeNull();
  });

  it("says the backend's reason when a change can no longer be undone", async () => {
    const u = userEvent.setup({ delay: null });
    const base = mockApi({ fresh: false });
    const refuse = () => Promise.reject(new ApiError(409, "conflict", "Bu değişiklik artık geri alınamaz."));
    renderWithApi(<LearningScreen />, { ...base, revertLearningChange: refuse });
    await u.click(await screen.findByRole("button", { name: /Geri al/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu değişiklik artık geri alınamaz.");
  });
});

describe("Ayarlar · Kendi kendine öğrenme", () => {
  it("is on by default, turns off with one press and lists the applied change with Geri al", async () => {
    const u = userEvent.setup({ delay: null });
    renderWithApi(<LearningSection />, mockApi({ fresh: false }));
    const sw = await screen.findByRole("switch", { name: "Kendi kendine öğrenme" });
    await screen.findByTestId("degisiklik-2");
    expect(sw).toHaveAttribute("aria-checked", "true");
    await u.click(sw);
    expect(await screen.findByText("Kapalı: KAPtan değişiklikleri yalnızca önerir, kendisi uygulamaz.")).toBeInTheDocument();
    expect(sw).toHaveAttribute("aria-checked", "false");
    await u.click(screen.getByRole("button", { name: /Geri al/ }));
    expect(await screen.findByText("Şu an uygulanmış bir değişiklik yok.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ne öğrendiğini gör/ })).toHaveAttribute("href", "/ogrendiklerim");
  });
});
