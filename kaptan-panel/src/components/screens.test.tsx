import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { engageKillSwitch, stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { approvalCards, riskStatus } from "@/lib/api/mock/selectors";
import { DEMO_E3_PROPOSAL, PENDING_PROPOSALS } from "@/mocks/ids";
import { buildExplain } from "@/mocks/explain-builder";
import { DEMO_E3_SPEC } from "@/mocks/runs-demo";
import { renderWithDesk } from "./harness.test-utils";
import { nav } from "./nav.test-utils";
import { TodayScreen } from "./today/today-screen";
import { ProposalScreen } from "./proposal/proposal-screen";
import { PortfolioScreen } from "./portfolio/portfolio-screen";
import { SettingsScreen, hoursToFinishWait } from "./settings/settings-screen";

vi.mock("next/navigation", async () => (await import("./nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.pathname = "/bugun";
});

describe("Bugün", () => {
  it("says how many proposals wait and lists them as cards", async () => {
    renderWithDesk(<TodayScreen />);
    expect(await screen.findByRole("heading", { level: 1, name: "Bugün 3 öneri var." })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Bekleyen öneriler" });
    expect(within(list).getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText(/Karar için 09:50’ye \d+ sa var\./)).toBeInTheDocument();
    expect(await screen.findByText(/^Tayfa bugün \d+ bildirim okudu/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Portföyün:/ })).toHaveAttribute("href", "/portfoy");
    expect(screen.getAllByRole("link", { name: /^İncele/ })[0]).toHaveAttribute("href", expect.stringMatching(/^\/oneri\/prop-day-/));
  });

  it("inks in a proposal that arrives live", async () => {
    const { db } = renderWithDesk(<TodayScreen />);
    await screen.findByRole("heading", { level: 1, name: "Bugün 3 öneri var." });
    const card = buildExplain(DEMO_E3_SPEC).approval;
    act(() => {
      db.bus.emit("desk", "approval.requested", card);
    });
    const arrived = await screen.findByRole("article", { name: "ÖRNEK ENERJİ" });
    expect(within(arrived).getByText("yeni")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bugün 4 öneri var.");
  });

  it("says plainly when you have stopped everything", async () => {
    const db = new MockDb(null);
    engageKillSwitch(db, "user:sen", "test durdurması");
    renderWithDesk(<TodayScreen />, db);
    expect(await screen.findByRole("heading", { level: 1, name: "Durdurdun — yeni öneri gelmez." })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Bekleyen öneriler" })).toBeNull();
  });
});

describe("Öneri", () => {
  it("tells the story and takes one decision: approve → slip → Girdim", async () => {
    const u = user();
    const id = PENDING_PROPOSALS[0];
    renderWithDesk(<ProposalScreen proposalId={id} />);
    expect(await screen.findByRole("heading", { level: 1, name: /kendi hissesini geri aldı\.$/ })).toBeInTheDocument();
    for (const label of ["Ne oldu?", "Neden önemli?", "Geçmişte ne oldu?", "Tayfa ne dedi?", "Risk", "Öneri"]) {
      expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("list", { name: "Önerinin yolu" })).toBeInTheDocument();
    expect(await screen.findByText(/Fiyat .* inerse çıkılır/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /benzer olay: \d+ yükseldi/ })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Tayfanın notları" })).getAllByRole("listitem")).toHaveLength(8);

    await u.click(screen.getByText("Tüm ayrıntılar"));
    expect(screen.getByRole("heading", { name: "Kurallar" })).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Onayla" }));
    const slip = await screen.findByRole("group", { name: /^Emir fişi/ });
    expect(screen.getByText(/^Onayladın/)).toBeInTheDocument();
    await u.click(within(slip).getByRole("button", { name: "Girdim" }));
    await u.click(within(slip).getByRole("button", { name: "Kaydet" }));
    expect(await within(slip).findByText(/^Girildi · /)).toBeInTheDocument();
    expect(within(slip).getByRole("link", { name: "Portföyünde →" })).toHaveAttribute("href", "/portfoy");
  });

  it("checks the fill before saving and marks Dolmadı from the … menu", async () => {
    const u = user();
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[1]} />);
    await u.click(await screen.findByRole("button", { name: "Onayla" }));
    const slip = await screen.findByRole("group", { name: /^Emir fişi/ });
    await u.click(within(slip).getByRole("button", { name: "Girdim" }));
    const lot = within(slip).getByRole("textbox", { name: "Lot" });
    await u.clear(lot);
    await u.type(lot, "999999");
    await u.click(within(slip).getByRole("button", { name: "Kaydet" }));
    expect(within(slip).getByRole("alert")).toHaveTextContent(/fazla olamaz/);
    await u.click(within(slip).getByRole("button", { name: "Vazgeç" }));
    await u.click(within(slip).getByRole("button", { name: "Başka bir sonuç" }));
    await u.click(await screen.findByRole("menuitem", { name: "Dolmadı" }));
    expect(await within(slip).findByText("Dolmadı")).toBeInTheDocument();
  });

  it("rejects with an optional note", async () => {
    const u = user();
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[2]} />);
    await u.click(await screen.findByRole("button", { name: "Reddet" }));
    const dialog = screen.getByRole("dialog", { name: "Bu öneriyi reddet" });
    await u.type(within(dialog).getByRole("textbox"), "Tek seferlik kâr");
    await u.click(within(dialog).getByRole("button", { name: "Reddet" }));
    expect(await screen.findByRole("heading", { name: "Reddettin." })).toBeInTheDocument();
  });

  it("drops open proposals while stopped and says why", async () => {
    const db = new MockDb(null);
    engageKillSwitch(db, "user:sen", "test durdurması");
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[0]} />, db);
    expect(await screen.findByRole("heading", { name: "İptal oldu." })).toBeInTheDocument();
    expect(screen.getByText("Her şeyi durdurduğun için bu öneri düştü.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Onayla" })).toBeNull();
  });

  it("shows decided and unknown proposals plainly", async () => {
    const db = new MockDb(null);
    const decided = approvalCards(db.snapshot).find((c) => c.status === "rejected");
    if (!decided) throw new Error("fixture");
    const { unmount } = renderWithDesk(<ProposalScreen proposalId={decided.proposal_id} />, db);
    expect(await screen.findByRole("heading", { name: "Reddettin." })).toBeInTheDocument();
    unmount();
    renderWithDesk(<ProposalScreen proposalId="prop-yok" />);
    expect(await screen.findByRole("heading", { name: "Bu öneri bulunamadı." })).toBeInTheDocument();
  });

  it("follows a decision made elsewhere", async () => {
    const { db } = renderWithDesk(<ProposalScreen proposalId={DEMO_E3_PROPOSAL} />);
    expect(await screen.findByRole("heading", { name: "Bu öneri bulunamadı." })).toBeInTheDocument();
    const card = buildExplain(DEMO_E3_SPEC).approval;
    if (!card) throw new Error("fixture");
    act(() => {
      db.bus.emit("desk", "approval.decided", { ...card, status: "rejected", decided_at: db.nowIso(), decided_by: "sen" });
    });
    expect(await screen.findByRole("heading", { name: "Reddettin." })).toBeInTheDocument();
  });
});

describe("Portföy", () => {
  it("shows the total, what you hold and the Durdur → wait → restart cycle", async () => {
    const u = user();
    const { db } = renderWithDesk(<PortfolioScreen />);
    expect(await screen.findByRole("heading", { level: 1, name: /TL$/ })).toBeInTheDocument();
    const held = await screen.findByRole("list", { name: "Elindekiler" });
    expect(within(held).getAllByRole("listitem").length).toBeGreaterThan(3);
    expect(within(held).getAllByText(/gün kaldı|bugün çıkılır/).length).toBeGreaterThan(0);

    await u.click(screen.getByRole("button", { name: "Durdur" }));
    const stop = screen.getByRole("dialog", { name: "Her şeyi durdur" });
    expect(within(stop).getByRole("button", { name: "Durdur" })).toBeDisabled();
    await u.type(within(stop).getByRole("textbox"), "Piyasa çok oynak, ara veriyorum.");
    await u.click(within(stop).getByRole("button", { name: "Durdur" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const state = await screen.findByTestId("stop-state");
    expect(state).toHaveTextContent("Yeniden başlatmak için 24 saat ve 5 seans beklemen gerekiyor.");
    expect(within(state).getByRole("button", { name: "Yeniden başlat" })).toBeDisabled();

    act(() => {
      db.update((s) => ({ ...s, clockOffsetH: s.clockOffsetH + 24 * 10 }));
      db.bus.emit("desk", "kill_switch", riskStatus(db.snapshot));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Yeniden başlat" })).toBeEnabled());
    expect(screen.getByTestId("reset-left")).toHaveTextContent("doldu");
    await u.click(screen.getByRole("button", { name: "Yeniden başlat" }));
    const again = screen.getByRole("dialog", { name: "Yeniden başlat" });
    await u.type(within(again).getByRole("textbox"), "Bekleme doldu, dönüyorum.");
    await u.click(within(again).getByRole("button", { name: "Yeniden başlat" }));
    expect(await screen.findByRole("button", { name: "Durdur" })).toBeInTheDocument();
    expect(screen.queryByTestId("stop-state")).toBeNull();
  });

  it("asks for a first note when the −5% rule stopped everything", async () => {
    const u = user();
    const db = new MockDb(null);
    engageKillSwitch(db, "system:risk_monitor", "Zirveden −%5 düşüş (R01)");
    renderWithDesk(<PortfolioScreen />, db);
    await u.click(await screen.findByRole("button", { name: "Yeniden başlatmayı iste" }));
    const d = screen.getByRole("dialog", { name: "Yeniden başlatmayı iste" });
    await u.type(within(d).getByRole("textbox"), "Kural doğru çalıştı, inceledim.");
    await u.click(within(d).getByRole("button", { name: "Onayla" }));
    expect(await screen.findByText("Yeniden başlatmak için 24 saat ve 5 seans beklemen gerekiyor.")).toBeInTheDocument();
  });
});

describe("Ayarlar", () => {
  it("adds a scenario, fast-forwards only when stopped, resets the demo and signs out", async () => {
    const u = user();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const { db } = renderWithDesk(<SettingsScreen />);
    await u.click(await screen.findByRole("button", { name: "Senaryo ekle: Gizli talimat" }));
    expect(await screen.findByText("Eklendi: Gizli talimat.")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Senaryo ekle: Yeni iş (E3)" }));
    expect(await screen.findByRole("link", { name: "Bugün’e git →" })).toHaveAttribute("href", "/bugun");

    const clock = await screen.findByTestId("reset-clock");
    expect(within(clock).getByRole("button", { name: "+24 saat" })).toBeDisabled();
    act(() => engageKillSwitch(db, "system:risk_monitor", "R01"));
    await waitFor(() => expect(within(clock).getByRole("button", { name: "+24 saat" })).toBeEnabled());
    await u.click(within(clock).getByRole("button", { name: "+24 saat" }));
    expect(await screen.findByText("Zaman ileri sarıldı.")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Demo verisini sıfırla" }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sıfırla" }));
    expect(await screen.findByText("Demo verisi sıfırlandı.")).toBeInTheDocument();
    expect(db.snapshot.injections).toHaveLength(0);

    await u.click(screen.getByRole("button", { name: "Çıkış" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
    fetchSpy.mockRestore();
  });

  it("knows how long the wait still needs", () => {
    expect(hoursToFinishWait(null, 0)).toBeNull();
    const reset = {
      sessions_since_kill: 0,
      sessions_required: 5,
      sessions_ready_at: "2027-01-18T15:10:00.000Z",
      min_gap_hours: 24,
      first: { at: "2027-01-11T11:00:00.000Z", reason: "x" },
      second_allowed_at: "2027-01-12T11:00:00.000Z",
      next_step: "wait" as const,
      ready_at: "2027-01-18T15:10:00.000Z",
    };
    expect(hoursToFinishWait(reset, Date.parse("2027-01-18T14:10:00.000Z"))).toBe(2);
    expect(hoursToFinishWait(reset, Date.parse("2027-01-01T00:00:00.000Z"))).toBe(336);
    expect(hoursToFinishWait({ ...reset, first: null }, 0)).toBeNull();
  });
});
