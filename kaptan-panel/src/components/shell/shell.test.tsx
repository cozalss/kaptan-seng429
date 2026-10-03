import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "./app-shell";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker, engageKillSwitch } from "@/lib/api/mock/scenarios";
import type { SessionUser } from "@/lib/auth/session-context";

const push = vi.fn();
const refresh = vi.fn();
let pathname = "/inbox";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, refresh, prefetch: vi.fn() }),
  usePathname: () => pathname,
}));

const RISK: SessionUser = { uid: "u-risk", email: "risk@kaptan.demo", name: "Zeynep (Risk Officer)", role: "risk_officer" };
const ANALYST: SessionUser = { uid: "u-analist", email: "analist@kaptan.demo", name: "Mert (Analist)", role: "analyst" };

let db: MockDb;
beforeEach(() => {
  db = new MockDb(null);
  __setMockDb(db);
  pathname = "/inbox";
  push.mockReset();
});
afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
});

describe("AppShell (mock mode)", () => {
  it("renders the frame: ribbon, navigation, session, counters and pending approvals", async () => {
    render(
      <AppShell user={RISK}>
        <p>İçerik</p>
      </AppShell>,
    );
    expect(screen.getByText("DEMO VERİSİ")).toBeInTheDocument();
    const nav = screen.getAllByRole("navigation", { name: "Ana gezinme" })[0] as HTMLElement;
    expect(within(nav).getByRole("link", { name: "Canlı akış" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).queryByRole("link", { name: /Yönetim/ })).toBeNull();
    expect(screen.getByRole("main")).toHaveTextContent("İçerik");
    expect(screen.getByText(/yatırım tavsiyesi değildir/i)).toBeInTheDocument();
    await waitFor(() => expect(within(nav).getByText("bekleyen onay", { exact: false })).toBeInTheDocument());
    expect((await screen.findAllByText(/bildirim/)).length).toBeGreaterThan(0);
  });

  it("shows the Admin route only to the Admin", () => {
    render(
      <AppShell user={{ ...RISK, uid: "u-admin", name: "Burak (Admin)", role: "admin" }}>
        <p>x</p>
      </AppShell>,
    );
    const nav = screen.getAllByRole("navigation", { name: "Ana gezinme" })[0] as HTMLElement;
    expect(within(nav).getByRole("link", { name: /Yönetim/ })).toBeInTheDocument();
  });

  it("raises the north-red band when the kill switch engages", async () => {
    render(
      <AppShell user={ANALYST}>
        <p>x</p>
      </AppShell>,
    );
    await act(async () => {
      engageKillSwitch(db, "user:u-risk", "Test durdurma");
    });
    expect((await screen.findAllByText("KILL SWITCH AÇIK")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Sebep: Test durdurma/)).toBeInTheDocument();
  });

  it("opens the command palette with Ctrl+K and navigates", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <AppShell user={ANALYST}>
        <p>x</p>
      </AppShell>,
    );
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("combobox"), "Denetim");
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/audit");
  });

  it("switches the demo role through the mock session endpoint", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ redirect: "/approvals" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AppShell user={ANALYST}>
        <p>x</p>
      </AppShell>,
    );
    const nav = screen.getAllByRole("navigation", { name: "Ana gezinme" })[0] as HTMLElement;
    const group = within(nav).getByRole("group", { name: /Rol değiştir/ });
    expect(within(group).getByRole("button", { name: "Analist" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(group).getByRole("button", { name: "Risk Officer" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/mock/session");
    vi.unstubAllGlobals();
  });
});
