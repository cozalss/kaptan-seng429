import { act, screen, within } from "@testing-library/react";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { engageKillSwitch, stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { buildExplain } from "@/mocks/explain-builder";
import { DEMO_E3_SPEC } from "@/mocks/runs-demo";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { TodayScreen } from "./today-screen";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.pathname = "/bugun";
});

describe("Bugün", () => {
  it("says how many proposals wait and lists them as cards", async () => {
    renderWithDesk(<TodayScreen />);
    expect(await screen.findByRole("heading", { level: 1, name: "Bugün 4 öneri var." })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Bekleyen öneriler" });
    const cards = within(list).getAllByRole("article");
    expect(cards).toHaveLength(4);
    // The seeded sell (an X1 exit) is tagged Satış; the buys are tagged Alış.
    expect(within(list).getAllByText("Satış")).toHaveLength(1);
    // Each row: amount, lots and price cap, the deadline, and where it stands in the two signatures.
    expect(cards[0]).toHaveTextContent(/\d[\d.]* TL\d+ lot · en fazla [\d.,]+ TLSon saat (bugün|yarın|\d+ \S+) 09:50/);
    expect(cards[0]).toHaveTextContent("İmzalar: kurallar imzaladı;İmza 1/2 · ikinci imza senin");
    // One meta line under the title: notices read and the soonest deadline (no clock bar, no crew strip).
    expect(await screen.findByText(/\d+ bildirim okundu · en yakın son saat (bugün|yarın|\d+ \S+) 09:50$/)).toBeInTheDocument();
    expect(screen.queryByText("Karar saati")).toBeNull();
    expect(screen.queryByRole("list", { name: /Tayfa/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Portföyün:/ })).toHaveAttribute("href", "/portfoy");
    expect(screen.getAllByRole("link", { name: /^İncele/ })[0]).toHaveAttribute("href", expect.stringMatching(/^\/oneri\/prop-day-/));
  });

  it("shows nothing under Seni bekleyenler for a Denetçi", async () => {
    renderWithDesk(<TodayScreen />, new MockDb(null), "auditor");
    await screen.findByRole("heading", { level: 1, name: "Bugün 4 öneri var." });
    expect(screen.queryByRole("heading", { name: "Seni bekleyenler" })).toBeNull();
  });

  it("inks in a proposal that arrives live", async () => {
    const { db } = renderWithDesk(<TodayScreen />);
    await screen.findByRole("heading", { level: 1, name: "Bugün 4 öneri var." });
    const card = buildExplain(DEMO_E3_SPEC).approval;
    act(() => {
      db.bus.emit("desk", "approval.requested", card);
    });
    const arrived = await screen.findByRole("article", { name: "ÖRNEK ENERJİ" });
    expect(within(arrived).getByText("yeni")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bugün 5 öneri var.");
  });

  it("says plainly when you have stopped everything", async () => {
    const db = new MockDb(null);
    engageKillSwitch(db, "user:uye-3", "test durdurması");
    renderWithDesk(<TodayScreen />, db);
    expect(await screen.findByRole("heading", { level: 1, name: "Her şey durduruldu — yeni öneri gelmez." })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Bekleyen öneriler" })).toBeNull();
  });
});
