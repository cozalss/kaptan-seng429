import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { engageKillSwitch, stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { buildExplain } from "@/mocks/explain-builder";
import { DEMO_E3_SPEC } from "@/mocks/runs-demo";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { AppShell } from "./app-shell";
import { RiskBanner } from "./banners";
import { TopBar } from "./top-bar";
import { logout } from "./session-actions";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const OFFICER = { uid: "uye-3", name: "Üye 3", role: "risk_officer" } as const;

afterEach(() => {
  act(() => {
    toast.dismiss();
  });
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.pathname = "/bugun";
  vi.restoreAllMocks();
});

describe("top bar", () => {
  it("has Bugün, Portföy, Denetim and one account menu, and marks the current place", async () => {
    nav.pathname = "/oneri/p-1";
    renderWithDesk(<TopBar />);
    const main = screen.getByRole("navigation", { name: "Ana gezinme" });
    expect(within(main).getAllByRole("link").map((a) => a.textContent)).toEqual(["Bugün", "Portföy", "Denetim"]);
    // One account menu at every width; its name starts with the role.
    expect(screen.getAllByRole("button", { name: /^Rol: Risk Sorumlusu\. Hesap: / })).toHaveLength(1);
    expect(screen.queryByText("Kimin gözüyle bakıyorsun?")).toBeNull();
    expect(within(main).getByRole("link", { name: "Bugün" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "KAPtan — Bugün" })).toHaveAttribute("href", "/bugun");
  });

  it("switches the account from the menu and keeps the choice", async () => {
    const u = userEvent.setup({ delay: null });
    renderWithDesk(<TopBar />);
    await u.click(screen.getByRole("button", { name: /^Rol: Risk Sorumlusu\./ }));
    expect(await screen.findByText("Hesap değiştir")).toBeInTheDocument();
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual(["Analist · Üye 2", "Risk Sorumlusu · Üye 3", "Yönetici · Üye 1", "Denetçi · Denetçi"]);
    expect(items[1]).toHaveAttribute("aria-checked", "true");
    await u.click(screen.getByRole("menuitemradio", { name: /^Denetçi ·/ }));
    expect(await screen.findByRole("button", { name: /^Rol: Denetçi\. Hesap: Denetçi/ })).toBeInTheDocument();
  });

  it("opens Ayarlar and signs out from the account menu", async () => {
    const u = userEvent.setup({ delay: null });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    renderWithDesk(<TopBar />);
    await u.click(screen.getByRole("button", { name: /^Rol: / }));
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
  it("says nothing when all is normal, and alerts in north red once stopped", async () => {
    const { db } = renderWithDesk(<RiskBanner />);
    // The live region is always there (so its first words are read out), but empty.
    const region = screen.getByTestId("risk-banner");
    expect(region).toHaveAttribute("role", "status");
    await waitFor(() => expect(region).toBeEmptyDOMElement());
    act(() => engageKillSwitch(db, "user:uye-3", "Elle durdurdum"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Durduruldu.");
    expect(screen.getByRole("link", { name: "Portföy" })).toHaveAttribute("href", "/portfoy");
  });

  it("shows the daily pause", async () => {
    const db = new MockDb(null);
    db.update((s) => ({ ...s, risk: { ...s.risk, halted_today: true, daily_pnl_pct: -0.0112 } }));
    renderWithDesk(<RiskBanner />, db);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Bugün yeni emir yok."));
  });
});

describe("app shell", () => {
  it("frames a screen with the top bar, disclaimer, and a slip for proposals arriving elsewhere", async () => {
    const db = new MockDb(null);
    __setMockDb(db);
    nav.pathname = "/portfoy";
    render(
      <AppShell user={OFFICER}>
        <p>ekran</p>
      </AppShell>,
    );
    expect(screen.getByRole("main")).toHaveTextContent("ekran");
    expect(screen.getByText(/yatırım tavsiyesi değildir/)).toBeInTheDocument();
    await waitFor(() => expect(db.bus.listenerCount("desk")).toBeGreaterThan(0));
    act(() => {
      db.bus.emit("desk", "approval.requested", buildExplain(DEMO_E3_SPEC).approval);
    });
    expect(await screen.findByText("Yeni öneri: ÖRNEK ENERJİ A.Ş.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bildirimi kapat" })).toBeInTheDocument();
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "İncele" }));
    expect(nav.push).toHaveBeenCalledWith("/oneri/prop-demo-e3-ornek");
  });
});

describe("route focus", () => {
  it("leaves focus alone on the first render, then moves it to the new screen's sentence", async () => {
    __setMockDb(new MockDb(null));
    nav.pathname = "/bugun";
    const { rerender } = render(
      <AppShell user={OFFICER}>
        <h1 tabIndex={-1} data-route-focus="">
          Bugün
        </h1>
      </AppShell>,
    );
    expect(screen.getByRole("heading", { name: "Bugün" })).not.toHaveFocus();
    nav.pathname = "/portfoy";
    rerender(
      <AppShell user={OFFICER}>
        <h1 tabIndex={-1} data-route-focus="">
          Portföy
        </h1>
      </AppShell>,
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "Portföy" })).toHaveFocus());
  });

  it("falls back to <main> when a screen marks no sentence", async () => {
    __setMockDb(new MockDb(null));
    nav.pathname = "/bugun";
    const { rerender } = render(<AppShell user={OFFICER}>a</AppShell>);
    nav.pathname = "/denetim";
    rerender(<AppShell user={OFFICER}>b</AppShell>);
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });
});
