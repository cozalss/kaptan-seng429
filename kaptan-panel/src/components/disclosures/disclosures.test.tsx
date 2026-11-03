import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { createMockApi } from "@/lib/api/mock/mock-api";
import { ApiProvider } from "@/lib/api/react";
import { ApiError, type DisclosureQuery } from "@/lib/api/types";
import { MOCK_USER } from "@/lib/auth/mock-user";
import { SessionProvider } from "@/lib/auth/session-context";
import { DeskStateProvider } from "@/components/shell/desk-state";
import { renderWithDesk } from "../harness.test-utils";
import { DisclosuresScreen } from "./disclosures-screen";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
});

describe("Okunanlar", () => {
  it("opens with the day's sentence, explains a bildirim, and shows what became of each", async () => {
    renderWithDesk(<DisclosuresScreen />);
    expect(await screen.findByRole("heading", { level: 1, name: /^Okunanlar\.\s*Bugün [\d.]+ duyuru okudum, \d+’(i|si|sı|ü|u|yı) işine yarayabilir\.$/ })).toBeInTheDocument();
    expect(screen.getByText(/^Bildirim ya da duyuru, borsadaki bir şirketin yasa gereği/, { selector: "p" })).toBeInTheDocument();
    const stages = screen.getByRole("list", { name: "Okumanın aşamaları" });
    expect(within(stages).getAllByRole("listitem")).toHaveLength(4);

    const list = await screen.findByRole("group", { name: "Bildirim listesi" });
    const all = within(list).getAllByRole("listitem").length;
    // 25 at first, cut by the hour.
    expect(all).toBe(25);
    expect(within(list).getAllByRole("heading", { level: 3 })[0]).toHaveTextContent(/^\d\d:00–\d\d:00\d+ duyuru$/);
    expect(screen.getByRole("button", { name: /tane daha göster/ })).toBeInTheDocument();
    // The test double's records are fictional: no link to an unrelated page at KAP.
    expect(within(list).queryByRole("link", { name: /KAP’ta aç/ })).toBeNull();
  });

  it("links a real record to its own page at KAP, in a new tab", async () => {
    const db = new MockDb(null);
    __setMockDb(db);
    const api = createMockApi({ db, latencyMs: 0, live: false });
    const real = { ...api, disclosures: async (q?: DisclosureQuery) => (await api.disclosures(q)).map((d) => ({ ...d, ingest_source: "live" as const })) };
    render(
      <ApiProvider api={real}>
        <DeskStateProvider>
          <DisclosuresScreen />
        </DeskStateProvider>
      </ApiProvider>,
    );
    const list = await screen.findByRole("group", { name: "Bildirim listesi" });
    const kap = within(list).getAllByRole("link", { name: /KAP’ta aç/ })[0];
    expect(kap).toHaveAttribute("href", expect.stringMatching(/^https:\/\/www\.kap\.org\.tr\/tr\/Bildirim\/\d+$/));
    expect(kap).toHaveAttribute("target", "_blank");
  });

  it("lets the funnel filter the list, and says what to do when a search finds nothing", async () => {
    renderWithDesk(<DisclosuresScreen />);
    const u = userEvent.setup({ delay: null });
    const list = await screen.findByRole("group", { name: "Bildirim listesi" });
    const all = within(list).getAllByRole("listitem").length;
    await u.click(screen.getByRole("button", { name: /Yakından baktım/ }));
    await waitFor(() => expect(within(screen.getByRole("group", { name: "Bildirim listesi" })).getAllByRole("listitem").length).toBeLessThan(all));
    const close = screen.getByRole("group", { name: "Bildirim listesi" });
    expect(within(close).queryByText("Borsanın otomatik mesajı. Baktım, geçtim.")).toBeNull();

    await u.click(screen.getByRole("button", { name: /İşine yarayabilir/ }));
    await waitFor(() => expect(screen.getAllByRole("link", { name: "Öneriyi aç →" }).length).toBeGreaterThan(0));
    expect(within(screen.getByRole("group", { name: "Bildirim listesi" })).getAllByRole("listitem").length).toBe(screen.getAllByRole("link", { name: "Öneriyi aç →" }).length);

    await u.type(screen.getByRole("searchbox", { name: "Hisse ya da şirket ara" }), "zzzz");
    expect(await screen.findByText("Bu aramaya uyan duyuru yok.")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Hepsini göster" }));
    expect(await screen.findByRole("group", { name: "Bildirim listesi" })).toBeInTheDocument();
  });

  it("shows the suggestions first, each with the way to it", async () => {
    renderWithDesk(<DisclosuresScreen />);
    const worth = await screen.findByRole("region", { name: "Bugün işine yarayabilecekler" });
    expect(within(worth).getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(0);
    expect(within(worth).getAllByRole("link", { name: /^Neden öneriyorum\?/ })[0]).toHaveAttribute("href", expect.stringMatching(/^\/oneri\//));
  });

  it("steps back one trading day and speaks in the past", async () => {
    renderWithDesk(<DisclosuresScreen />);
    await screen.findByRole("group", { name: "Bildirim listesi" });
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "← Önceki borsa günü" }));
    expect(await screen.findByRole("heading", { level: 1, name: /8 Ocak’ta/ })).toBeInTheDocument();
  });

  it("says the connection failed and offers a retry", async () => {
    const db = new MockDb(null);
    __setMockDb(db);
    const api = createMockApi({ db, latencyMs: 0, live: false });
    const down = { ...api, disclosures: () => Promise.reject(new ApiError(503, "down", "Sunucuya ulaşılamadı.")) };
    render(
      <SessionProvider user={MOCK_USER}>
        <ApiProvider api={down}>
          <DeskStateProvider>
            <DisclosuresScreen />
          </DeskStateProvider>
        </ApiProvider>
      </SessionProvider>,
    );
    expect(await screen.findByText("Bağlantı kurulamadı.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yeniden dene" })).toBeInTheDocument();
  });
});
