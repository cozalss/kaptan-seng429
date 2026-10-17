import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { actorFor, createMockApi } from "@/lib/api/mock/mock-api";
import { ApiProvider } from "@/lib/api/react";
import { SessionProvider } from "@/lib/auth/session-context";
import { DeskStateProvider } from "@/components/shell/desk-state";
import { engageKillSwitch, stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { PortfolioScreen } from "./portfolio-screen";
import { PortfolioHero } from "./portfolio-hero";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.pathname = "/bugun";
});

describe("Portföy", () => {
  it("stops with one person and restarts with two: Yönetici starts (1/2), Risk Sorumlusu confirms (2/2)", async () => {
    const u = user();
    renderWithDesk(<PortfolioScreen />, new MockDb(null), "analyst");
    expect(await screen.findByRole("heading", { level: 1, name: "Portföy" })).toBeInTheDocument();
    expect(await screen.findByText("Toplam değer")).toBeInTheDocument();
    const held = await screen.findByRole("table", { name: "Elindekiler" });
    const rows = within(held).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(3);
    expect(within(held).getAllByText(/gün kaldı|bugün çıkılır/).length).toBeGreaterThan(0);
    // Each holding opens its öneri; names read in title case, with no internal book codes.
    const links = within(held).getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", expect.stringMatching(/^\/oneri\/prop-/));
    expect(held).not.toHaveTextContent("paper");
    expect(screen.getByText(/Son \d+ seansta/)).toBeInTheDocument();
    expect(screen.getByText("Çalışıyor")).toBeInTheDocument();

    // The Analist cannot stop; the reason names who can.
    expect(screen.getByRole("button", { name: "Durdur" })).toBeDisabled();
    expect(screen.getByTestId("denied-kill.stop")).toHaveTextContent("Bunu Risk Sorumlusu ya da Yönetici yapar.");
    await u.click(screen.getByRole("button", { name: "Risk Sorumlusu gözüyle bak →" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Durdur" })).toBeEnabled());

    await u.click(screen.getByRole("button", { name: "Durdur" }));
    const stop = screen.getByRole("dialog", { name: "Her şeyi durdur" });
    expect(stop).toHaveTextContent("Geri açmak iki kişi ister: Yönetici başlatır, Risk Sorumlusu onaylar.");
    // Too short: the button still answers and says what is missing.
    const box = within(stop).getByRole("textbox", { name: "Neden durduruyorsun?" });
    expect(box).toHaveAccessibleDescription(/En az 10 harf; denetim defterine yazılır/);
    const submit = within(stop).getByRole("button", { name: "Durdur" });
    expect(submit).toHaveAttribute("aria-disabled", "true");
    await u.type(box, "Oynak");
    await u.click(submit);
    expect(within(stop).getByRole("alert")).toHaveTextContent("En az 10 harf yazmalısın.");
    expect(box).toHaveAttribute("aria-invalid", "true");
    await u.type(box, " piyasa, ara veriyorum.");
    expect(within(stop).queryByRole("alert")).toBeNull();
    await u.click(within(stop).getByRole("button", { name: "Durdur" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const state = await screen.findByTestId("stop-state");
    // Focus lands on the new state, so a screen reader hears "Durduruldu."
    await waitFor(() => expect(within(state).getByRole("status")).toHaveFocus());
    expect(state).toHaveTextContent("Yönetici başlatır, Risk Sorumlusu onaylar.");
    expect(screen.getAllByText("Durduruldu").length).toBeGreaterThan(0);
    expect(state).toHaveTextContent("Üye 3 (Risk Sorumlusu)");

    // The Risk Sorumlusu cannot start the restart.
    expect(within(state).getByRole("button", { name: "Yeniden başlatmayı başlat" })).toBeDisabled();
    await u.click(within(state).getByRole("button", { name: "Yönetici gözüyle bak →" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Yeniden başlatmayı başlat" })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: "Yeniden başlatmayı başlat" }));
    const start = screen.getByRole("dialog", { name: "Yeniden başlatmayı başlat" });
    await u.type(within(start).getByRole("textbox"), "Olay incelendi, eşikler doğru.");
    await u.click(within(start).getByRole("button", { name: "Başlat (1/2)" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("reset-stamp-1")).toHaveTextContent("Üye 1 · Yönetici");
    expect(screen.getByTestId("reset-stamp-1")).toHaveTextContent("İmzalandı:");
    expect(screen.getByTestId("reset-stamp-2")).toHaveTextContent("imza bekleniyor");

    // The Yönetici cannot confirm their own start.
    expect(screen.getByRole("button", { name: "Onayla ve yeniden başlat" })).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Risk Sorumlusu gözüyle bak →" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Onayla ve yeniden başlat" })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: "Onayla ve yeniden başlat" }));
    const confirm = screen.getByRole("dialog", { name: "Onayla ve yeniden başlat" });
    await u.type(within(confirm).getByRole("textbox"), "İkinci imza, onaylıyorum.");
    await u.click(within(confirm).getByRole("button", { name: "Onayla (2/2)" }));
    expect(await screen.findByRole("button", { name: "Durdur" })).toBeInTheDocument();
    expect(screen.queryByTestId("stop-state")).toBeNull();
    expect(screen.getByText("Yeniden açıldı.")).toBeInTheDocument();
  });

  it("names the risk monitor when the −5% rule stopped everything, and shows an API error in the dialog", async () => {
    const u = user();
    const db = new MockDb(null);
    engageKillSwitch(db, "system:risk_monitor", "Zirveden −%5 düşüş (R01)");
    renderWithDesk(<PortfolioScreen />, db, "admin");
    const state = await screen.findByTestId("stop-state");
    expect(state).toHaveTextContent("Risk izleyici");
    expect(state).toHaveTextContent("Zirveden −%5 düşüş (R01)");
    // Someone else started it in the meantime → the 409 shows in place.
    db.update((s) => ({ ...s, risk: { ...s.risk, reset_started: { uid: "uye-1", name: "Üye 1", role: "admin", at: db.nowIso(), reason: "başka sekme" } } }));
    await u.click(screen.getByRole("button", { name: "Yeniden başlatmayı başlat" }));
    const d = screen.getByRole("dialog", { name: "Yeniden başlatmayı başlat" });
    await u.type(within(d).getByRole("textbox"), "Kural doğru çalıştı, inceledim.");
    await u.click(within(d).getByRole("button", { name: "Başlat (1/2)" }));
    expect(await within(d).findByRole("alert")).toHaveTextContent(/zaten başlatıldı/);
    await u.click(within(d).getByRole("button", { name: "Vazgeç" }));
  });

  it("says the server cannot be reached instead of loading forever, and retries", async () => {
    const db = new MockDb(null);
    __setMockDb(db);
    const api = createMockApi({ getActor: () => actorFor("risk_officer"), db, latencyMs: 0, live: false });
    const down = { ...api, riskStatus: () => Promise.reject(new Error("ağ yok")) };
    render(
      <SessionProvider user={actorFor("risk_officer")}>
        <ApiProvider api={down}>
          <DeskStateProvider>
            <PortfolioScreen />
          </DeskStateProvider>
        </ApiProvider>
      </SessionProvider>,
    );
    expect(await screen.findByText("Panel sunucuya ulaşamadı; öneriler ve portföy yüklenemedi.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Yeniden dene" }).length).toBeGreaterThan(0);
  });

  it("puts today's figure on the ochre band when the daily −1% rule paused new orders", () => {
    const risk = {
      kill_switch: "off", kill_reason: null, kill_at: null, kill_by: null, halted_today: true, daily_pnl_pct: -0.0112,
      drawdown_pct: -0.024, peak_equity: 1_030_000, equity: 1_005_000, regime: "normal", live_armed: false, quota: [], reset: null,
      as_of: "2027-01-11T10:00:00Z",
    } as const;
    const { rerender } = render(<PortfolioHero risk={{ ...risk, quota: [] }} />);
    expect(screen.getByText("Bugün · yeni emir yok")).toBeInTheDocument();
    expect(screen.getByText(/^1\.005\.000/)).toBeInTheDocument();
    rerender(<PortfolioHero risk={{ ...risk, quota: [], halted_today: false, drawdown_pct: 0 }} />);
    expect(screen.getByText("Bugün")).toBeInTheDocument();
    expect(screen.getByText("zirvede")).toBeInTheDocument();
  });
});
