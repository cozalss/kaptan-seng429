import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { engageKillSwitch, stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { buildExplain } from "@/mocks/explain-builder";
import { DEMO_E3_SPEC } from "@/mocks/runs-demo";
import { Toaster } from "@/components/ui/toast";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { AppShell } from "./app-shell";
import { DemoRibbon, RiskBanner } from "./banners";
import { TopBar } from "./top-bar";
import { logout } from "./session-actions";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.pathname = "/bugun";
  vi.restoreAllMocks();
});

describe("top bar", () => {
  it("has only Bugün, Portföy and the ⚙ menu, and marks the current one", async () => {
    nav.pathname = "/oneri/p-1";
    render(<TopBar />);
    const main = screen.getByRole("navigation", { name: "Ana gezinme" });
    expect(within(main).getAllByRole("link").map((a) => a.textContent)).toEqual(["Bugün", "Portföy"]);
    expect(within(main).getByRole("link", { name: "Bugün" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "KAPtan — Bugün" })).toHaveAttribute("href", "/bugun");
  });

  it("opens Ayarlar and signs out from the ⚙ menu", async () => {
    const u = userEvent.setup({ delay: null });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    render(<TopBar />);
    await u.click(screen.getByRole("button", { name: "Ayarlar ve çıkış" }));
    expect(await screen.findByRole("menuitem", { name: "Ayarlar" })).toHaveAttribute("href", "/ayarlar");
    await u.click(screen.getByRole("menuitem", { name: "Çıkış" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
  });

  it("still signs out when the network fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(await logout()).toBe("/login");
  });
});

describe("banners", () => {
  it("prints the short demo ribbon", () => {
    render(<DemoRibbon />);
    expect(screen.getByText("DEMO VERİSİ")).toBeInTheDocument();
  });

  it("says nothing when all is normal, and north red once stopped", async () => {
    const { db } = renderWithDesk(<RiskBanner />);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    act(() => engageKillSwitch(db, "user:sen", "Elle durdurdum"));
    expect(await screen.findByRole("status")).toHaveTextContent("Durduruldu.");
  });

  it("shows the daily pause", async () => {
    const db = new MockDb(null);
    db.update((s) => ({ ...s, risk: { ...s.risk, halted_today: true, daily_pnl_pct: -0.0112 } }));
    renderWithDesk(<RiskBanner />, db);
    expect(await screen.findByRole("status")).toHaveTextContent("Bugün yeni emir yok.");
  });
});

describe("app shell", () => {
  it("frames a screen with the ribbon, top bar, disclaimer, and a slip for proposals arriving elsewhere", async () => {
    const db = new MockDb(null);
    __setMockDb(db);
    nav.pathname = "/portfoy";
    render(
      <>
        <AppShell user={{ uid: "sen", name: "Sen" }}>
          <p>ekran</p>
        </AppShell>
        <Toaster />
      </>,
    );
    expect(screen.getByRole("main")).toHaveTextContent("ekran");
    expect(screen.getByText("DEMO VERİSİ")).toBeInTheDocument();
    expect(screen.getByText(/yatırım tavsiyesi değildir/)).toBeInTheDocument();
    await waitFor(() => expect(db.bus.listenerCount("desk")).toBeGreaterThan(0));
    act(() => {
      db.bus.emit("desk", "approval.requested", buildExplain(DEMO_E3_SPEC).approval);
    });
    expect(await screen.findByText("Yeni öneri: ÖRNEK ENERJİ A.Ş.")).toBeInTheDocument();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "İncele" }));
    expect(nav.push).toHaveBeenCalledWith("/oneri/prop-demo-e3-ornek");
  });
});
