import { render, screen, within } from "@testing-library/react";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { createMockApi } from "@/lib/api/mock/mock-api";
import { ApiProvider } from "@/lib/api/react";
import { MOCK_USER } from "@/lib/auth/mock-user";
import { SessionProvider } from "@/lib/auth/session-context";
import { DeskStateProvider } from "@/components/shell/desk-state";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { PortfolioScreen } from "./portfolio-screen";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.pathname = "/portfoy";
});

describe("Param", () => {
  it("shows what is held and offers no way to stop anything", async () => {
    renderWithDesk(<PortfolioScreen />, new MockDb(null));
    expect(await screen.findByRole("heading", { level: 1, name: /^Param\.\s*Paran \d+ yerde duruyor\.$/ })).toBeInTheDocument();
    const held = await screen.findByRole("list", { name: "Elindekiler" });
    expect(within(held).getAllByRole("link").find((l) => l.getAttribute("href")?.startsWith("/oneri/"))).toHaveAttribute("href", expect.stringMatching(/^\/oneri\/prop-/));
    expect(held).not.toHaveTextContent("paper");
    expect(screen.getByText("Hepsi birlikte")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /durdur/i })).toBeNull();
    expect(screen.queryByTestId("stop-state")).toBeNull();
    expect(screen.queryByText(/Seni koruyan iki fren/)).toBeNull();
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
});
