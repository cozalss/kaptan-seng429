import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { createMockApi } from "@/lib/api/mock/mock-api";
import { ApiProvider } from "@/lib/api/react";
import { MOCK_USER } from "@/lib/auth/mock-user";
import { SessionProvider } from "@/lib/auth/session-context";
import { DeskStateProvider } from "@/components/shell/desk-state";
import { engageKillSwitch, stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { PortfolioScreen } from "./portfolio-screen";
import { Guards } from "./guards";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.pathname = "/portfoy";
});

describe("Param", () => {
  it("shows what is held, stops with one press and restarts with one press (the test double has no wait)", async () => {
    const u = user();
    const { db } = renderWithDesk(<PortfolioScreen />, new MockDb(null));
    expect(await screen.findByRole("heading", { level: 1, name: /^Param\.\s*Paran \d+ yerde duruyor\.$/ })).toBeInTheDocument();
    const held = await screen.findByRole("list", { name: "Elindekiler" });
    expect(within(held).getAllByRole("link")[0]).toHaveAttribute("href", expect.stringMatching(/^\/oneri\/prop-/));
    expect(held).not.toHaveTextContent("paper");
    expect(await screen.findByText(/^Paran bugün .* düşerse KAPtan o gün yeni işlem önermez\. Şu an bu sınıra .* uzaktasın\.$/)).toBeInTheDocument();
    expect(screen.getByText("Hepsi birlikte")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Tüm işlemleri durdur" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Evet, durdur" }));
    expect(await screen.findByTestId("stop-state")).toHaveTextContent("Elindeki hisseler yerinde duruyor.");
    expect(db.snapshot.risk.kill_switch).toBe("on");

    await u.click(screen.getByRole("button", { name: "İşlemleri yeniden başlat" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Evet, yeniden başlat" }));
    await waitFor(() => expect(screen.queryByTestId("stop-state")).toBeNull());
    expect(db.snapshot.risk.kill_switch).toBe("off");
    expect(db.snapshot.auditAppends.map((a) => a.action)).toEqual(expect.arrayContaining(["kill_switch.reset_started", "auth.single_user_waiver", "kill_switch.reset"]));
  });

  it("files the request and says when it opens while the wait runs (real data)", async () => {
    const u = user();
    const db = new MockDb(null);
    __setMockDb(db);
    engageKillSwitch(db, "user:sen", "Durdurma testi");
    const api = createMockApi({ db, latencyMs: 0, live: false });
    const readyAt = "2027-02-01T07:00:00.000Z";
    const waiting = { ...api, startKillReset: async (i: { reason: string }) => ({ ...(await api.startKillReset(i)), reset: { started: { uid: "sen", name: "Deniz", at: db.nowIso(), reason: i.reason }, ready_at: readyAt } }) };
    const confirm = vi.spyOn(api, "confirmKillReset");
    render(
      <SessionProvider user={MOCK_USER}>
        <ApiProvider api={waiting}>
          <DeskStateProvider>
            <PortfolioScreen />
          </DeskStateProvider>
        </ApiProvider>
      </SessionProvider>,
    );
    await u.click(await screen.findByRole("button", { name: "İşlemleri yeniden başlat" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Evet, yeniden başlat" }));
    await waitFor(() => expect(db.snapshot.risk.reset_started).not.toBeNull());
    expect(confirm).not.toHaveBeenCalled();
    expect(db.snapshot.risk.kill_switch).toBe("on");
  });

  it("says the server cannot be reached instead of loading forever, and retries", async () => {
    const db = new MockDb(null);
    __setMockDb(db);
    const api = createMockApi({ db, latencyMs: 0, live: false });
    const down = { ...api, riskStatus: () => Promise.reject(new Error("ağ yok")) };
    render(
      <SessionProvider user={MOCK_USER}>
        <ApiProvider api={down}>
          <DeskStateProvider>
            <PortfolioScreen />
          </DeskStateProvider>
        </ApiProvider>
      </SessionProvider>,
    );
    expect(await screen.findByText("KAPtan’a ulaşılamıyor. Bilgisayarında çalışıyor mu?")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Yeniden dene" }).length).toBeGreaterThan(0);
  });

  it("explains the wait as protection, and drops the brakes' sentences when the limits are unknown", () => {
    const risk = {
      kill_switch: "off", kill_reason: null, kill_at: null, kill_by: null, halted_today: true, daily_pnl_pct: -0.0112,
      drawdown_pct: -0.024, peak_equity: 1_030_000, equity: 1_005_000, regime: "normal", live_armed: false, quota: [], reset: null,
      as_of: "2027-01-11T10:00:00Z",
    } as const;
    const { rerender } = render(<Guards risk={{ ...risk, quota: [] }} limits={null} />);
    expect(screen.queryByText("Günlük fren")).toBeNull();
    const db = new MockDb(null);
    const first = db.snapshot.limitVersions[0]!;
    const limits = { active: first, pending: null, history: [first] };
    rerender(<Guards risk={{ ...risk, quota: [] }} limits={limits} />);
    expect(screen.getByText("Bugünlük frene geldin: yeni işlem yok. Yarın kendiliğinden kalkar.")).toBeInTheDocument();
    rerender(<Guards risk={{ ...risk, quota: [], halted_today: false, daily_pnl_pct: 0.001 }} limits={limits} />);
    expect(screen.getByText(/^Paran en yüksek hâlinden .* düşerse her şey durur; elindekiler satılmaz\./)).toBeInTheDocument();
  });
});
