import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { engageKillSwitch, stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { approvalCards } from "@/lib/api/mock/selectors";
import { DEMO_E3_PROPOSAL, PENDING_PROPOSALS } from "@/mocks/ids";
import { buildExplain } from "@/mocks/explain-builder";
import { DEMO_E3_SPEC } from "@/mocks/runs-demo";
import { renderWithDesk } from "./harness.test-utils";
import { nav } from "./nav.test-utils";
import { TodayScreen } from "./today/today-screen";
import { ProposalScreen } from "./proposal/proposal-screen";
import { PortfolioScreen } from "./portfolio/portfolio-screen";

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
    engageKillSwitch(db, "user:uye-3", "test durdurması");
    renderWithDesk(<TodayScreen />, db);
    expect(await screen.findByRole("heading", { level: 1, name: "Her şey durduruldu — yeni öneri gelmez." })).toBeInTheDocument();
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

    expect(screen.getByTestId("human-signature")).toHaveTextContent("Risk Sorumlusu imzalar");
    expect(screen.getByText(/bu yüzden iki imza var/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Onayla" }));
    const slip = await screen.findByRole("group", { name: /^Emir fişi/ });
    expect(screen.getByText(/^İmzalandı/)).toBeInTheDocument();
    expect(screen.getByTestId("human-signature")).toHaveTextContent(/Risk Sorumlusu imzaladı.*Üye 3 · \d\d:\d\d · imza 2\/2/);
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
    expect(await screen.findByRole("heading", { name: "Reddedildi." })).toBeInTheDocument();
  });

  it("shows an Analist the closed Onayla with the reason, takes a note, and switches to the Risk Sorumlusu", async () => {
    const u = user();
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[0]} />, new MockDb(null), "analyst");
    const sign = await screen.findByRole("button", { name: "Onayla" });
    expect(sign).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reddet" })).toBeDisabled();
    expect(screen.getByTestId("denied-proposal.decide")).toHaveTextContent("Bunu Risk Sorumlusu yapar.");
    expect(screen.getByTestId("human-signature")).toHaveTextContent("Üye 3 bekleniyor");

    await u.type(screen.getByPlaceholderText("Kısa bir not…"), "Hacim düşük, dikkat.");
    await u.click(screen.getByRole("button", { name: "Not ekle" }));
    expect(await within(await screen.findByRole("list", { name: "Öneri notları" })).findByText("Hacim düşük, dikkat.")).toBeInTheDocument();
    expect(screen.getByText(/Üye 2 · Analist/)).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Risk Sorumlusu gözüyle bak →" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Onayla" })).toBeEnabled());
    expect(screen.queryByTestId("denied-proposal.decide")).toBeNull();
  });

  it("keeps a Denetçi read-only, with no note box", async () => {
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[0]} />, new MockDb(null), "auditor");
    expect(await screen.findByRole("button", { name: "Onayla" })).toBeDisabled();
    expect(screen.getByTestId("denied-proposal.note")).toHaveTextContent("Denetçi yalnızca bakar.");
    expect(screen.queryByPlaceholderText("Kısa bir not…")).toBeNull();
  });

  it("drops open proposals while stopped and says why", async () => {
    const db = new MockDb(null);
    engageKillSwitch(db, "user:uye-3", "test durdurması");
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[0]} />, db);
    expect(await screen.findByRole("heading", { name: "İptal oldu." })).toBeInTheDocument();
    expect(screen.getByText("Her şey durdurulduğu için bu öneri düştü.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Onayla" })).toBeNull();
  });

  it("shows decided and unknown proposals plainly", async () => {
    const db = new MockDb(null);
    const decided = approvalCards(db.snapshot).find((c) => c.status === "rejected");
    if (!decided) throw new Error("fixture");
    const { unmount } = renderWithDesk(<ProposalScreen proposalId={decided.proposal_id} />, db);
    expect(await screen.findByRole("heading", { name: "Reddedildi." })).toBeInTheDocument();
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
      db.bus.emit("desk", "approval.decided", { ...card, status: "rejected", decided_at: db.nowIso(), decided_by: "uye-3", decided_role: "risk_officer" });
    });
    expect(await screen.findByRole("heading", { name: "Reddedildi." })).toBeInTheDocument();
  });
});

describe("Portföy", () => {
  it("stops with one person and restarts with two: Yönetici starts (1/2), Risk Sorumlusu confirms (2/2)", async () => {
    const u = user();
    renderWithDesk(<PortfolioScreen />, new MockDb(null), "analyst");
    expect(await screen.findByRole("heading", { level: 1, name: /TL$/ })).toBeInTheDocument();
    const held = await screen.findByRole("list", { name: "Elindekiler" });
    expect(within(held).getAllByRole("listitem").length).toBeGreaterThan(3);
    expect(within(held).getAllByText(/gün kaldı|bugün çıkılır/).length).toBeGreaterThan(0);

    // The Analist cannot stop; the reason names who can.
    expect(screen.getByRole("button", { name: "Durdur" })).toBeDisabled();
    expect(screen.getByTestId("denied-kill.stop")).toHaveTextContent("Bunu Risk Sorumlusu ya da Yönetici yapar.");
    await u.click(screen.getByRole("button", { name: "Risk Sorumlusu gözüyle bak →" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Durdur" })).toBeEnabled());

    await u.click(screen.getByRole("button", { name: "Durdur" }));
    const stop = screen.getByRole("dialog", { name: "Her şeyi durdur" });
    expect(within(stop).getByRole("button", { name: "Durdur" })).toBeDisabled();
    await u.type(within(stop).getByRole("textbox"), "Piyasa çok oynak, ara veriyorum.");
    await u.click(within(stop).getByRole("button", { name: "Durdur" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const state = await screen.findByTestId("stop-state");
    expect(state).toHaveTextContent("Yönetici başlatır, Risk Sorumlusu onaylar.");
    expect(state).toHaveTextContent("Üye 3 (Risk Sorumlusu)");

    // The Risk Sorumlusu cannot start the restart.
    expect(within(state).getByRole("button", { name: "Yeniden başlatmayı başlat" })).toBeDisabled();
    await u.click(within(state).getByRole("button", { name: "Yönetici gözüyle bak →" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Yeniden başlatmayı başlat" })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: "Yeniden başlatmayı başlat" }));
    const start = screen.getByRole("dialog", { name: "Yeniden başlatmayı başlat" });
    await u.type(within(start).getByRole("textbox"), "Olay incelendi, eşikler doğru.");
    await u.click(within(start).getByRole("button", { name: "Başlat (1/2)" }));
    await waitFor(() => expect(screen.getByTestId("reset-stamp-1")).toHaveTextContent("Üye 1 · Yönetici"));
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
});
