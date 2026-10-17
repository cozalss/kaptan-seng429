import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { engageKillSwitch, stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { approvalCards } from "@/lib/api/mock/selectors";
import { DEMO_E3_PROPOSAL, PENDING_PROPOSALS } from "@/mocks/ids";
import { buildExplain } from "@/mocks/explain-builder";
import { DEMO_E3_SPEC } from "@/mocks/runs-demo";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { ProposalScreen } from "./proposal-screen";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.pathname = "/bugun";
});

describe("Öneri", () => {
  it("puts the proposal and the decision first, the story behind four sections: approve → slip → Girdim", async () => {
    const u = user();
    const id = PENDING_PROPOSALS[0];
    renderWithDesk(<ProposalScreen proposalId={id} />);
    expect(await screen.findByRole("heading", { level: 1, name: /kendi hissesini geri aldı\.$/ })).toBeInTheDocument();
    expect(screen.getByText("İmza bekliyor")).toBeInTheDocument();

    // The summary: lot and limit, then total, hold, stop, worst case, and the deadline.
    const summary = screen.getByRole("region", { name: "Öneri" });
    expect(summary).toHaveTextContent(/1\.480 lot al · limit /);
    expect(summary).toHaveTextContent(/Toplam tutar≈ .*TLTutma süresi20–40 gün/);
    expect(await within(summary).findByText(/^−.*TL$/)).toBeInTheDocument();
    expect(summary).toHaveTextContent(/Zarar durdurma.*Fiyat %.* düşerse satEn kötü durumda−/);
    expect(within(summary).getByText(/^Portföyün %.*karar için son saat/)).toBeInTheDocument();

    // The secondary sections are closed, with a meta line each; opening one shows its content.
    for (const name of ["Neden bu öneri?", "Tayfa ne dedi?", "Notlar", "Ayrıntılar"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.getByText(/^Benzer \d+ olayın/)).toBeInTheDocument();
    expect(screen.getByText(/^\d üye çalıştı;/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tayfanın notları" })).toBeNull();
    await u.click(screen.getByRole("button", { name: "Tayfa ne dedi?" }));
    expect(within(screen.getByRole("list", { name: "Tayfanın notları" })).getAllByRole("listitem")).toHaveLength(8);
    await u.click(screen.getByRole("button", { name: "Neden bu öneri?" }));
    for (const label of ["Ne oldu?", "Neden önemli?", "Geçmişte ne oldu?"]) {
      expect(screen.getByRole("heading", { name: label })).toBeVisible();
    }
    await u.click(screen.getByRole("button", { name: "Ayrıntılar" }));
    expect(screen.getByRole("heading", { name: "Kurallar" })).toBeVisible();

    expect(screen.getByTestId("human-signature")).toHaveTextContent("Bekliyor: 2. imza — Risk SorumlusuÜye 3 bekleniyor");
    expect(screen.getByRole("list", { name: "İmza zinciri" })).toHaveTextContent(/Tamamlandı: 1\. imza — Kurallar\d+\/\d+ kural geçti/);
    await u.click(screen.getByRole("button", { name: "Onayla" }));
    const slip = await screen.findByRole("group", { name: /^Emir fişi/ });
    const outcome = screen.getByRole("heading", { name: /^İmzalandı · \d\d:\d\d$/ });
    await waitFor(() => expect(outcome).toHaveFocus());
    expect(screen.getByTestId("human-signature")).toHaveTextContent(/Tamamlandı: 2\. imza — Risk SorumlusuÜye 3 · \d\d:\d\d/);
    // The one short stamp moment: the mark presses in and the slip rises, only because it was signed here.
    expect(screen.getByTestId("human-signature").querySelector("[data-mark=signed]")).toHaveClass("oneri-stamp-press");
    expect(slip).toHaveClass("oneri-slip-lay");
    expect(within(slip).getByRole("button", { name: "Kopyala" })).toBeEnabled();
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
    // The mark goes through the mock API and a re-render; give slow CI runners more than the 1 s default.
    expect(await within(slip).findByText("Dolmadı", undefined, { timeout: 5_000 })).toBeInTheDocument();
  });

  it("rejects with an optional note", async () => {
    const u = user();
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[2]} />);
    await u.click(await screen.findByRole("button", { name: "Reddet" }));
    const dialog = screen.getByRole("dialog", { name: "Bu öneriyi reddet" });
    await u.type(within(dialog).getByRole("textbox"), "Tek seferlik kâr");
    await u.click(within(dialog).getByRole("button", { name: "Reddet" }));
    const outcome = await screen.findByRole("heading", { name: "Reddedildi." });
    await waitFor(() => expect(outcome).toHaveFocus());
    expect(screen.getByTestId("human-signature")).toHaveTextContent(/Reddedildi: 2\. imza/);
  });

  it("shows an Analist the closed Onayla with the reason, takes a note, and switches to the Risk Sorumlusu", async () => {
    const u = user();
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[0]} />, new MockDb(null), "analyst");
    const sign = await screen.findByRole("button", { name: "Onayla" });
    expect(sign).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reddet" })).toBeDisabled();
    expect(screen.getByTestId("denied-proposal.decide")).toHaveTextContent("Bunu Risk Sorumlusu yapar.");
    expect(screen.getByTestId("human-signature")).toHaveTextContent("Üye 3 bekleniyor");

    // Notes are the Analist's job: that section starts open for them.
    expect(screen.getByRole("button", { name: "Notlar" })).toHaveAttribute("aria-expanded", "true");
    await u.type(screen.getByPlaceholderText("Kısa bir not…"), "Hacim düşük, dikkat.");
    await u.click(screen.getByRole("button", { name: "Not ekle" }));
    expect(await within(await screen.findByRole("list", { name: "Öneri notları" })).findByText("Hacim düşük, dikkat.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Öneri notları" })).getByText(/· Analist ·/)).toHaveTextContent(/^Üye 2 · Analist · \d\d:\d\d$/);

    await u.click(screen.getByRole("button", { name: "Risk Sorumlusu gözüyle bak →" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Onayla" })).toBeEnabled());
    expect(screen.queryByTestId("denied-proposal.decide")).toBeNull();
    expect(screen.getByRole("button", { name: "Notlar" })).toHaveAttribute("aria-expanded", "false");
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
    expect(screen.getByRole("heading", { name: "Reddedildi." })).not.toHaveFocus();
    unmount();
    renderWithDesk(<ProposalScreen proposalId="prop-yok" />);
    expect(await screen.findByRole("heading", { name: "Bu öneri bulunamadı." })).toBeInTheDocument();
  });

  it("shows an approval from before quietly: no animation", async () => {
    const db = new MockDb(null);
    const approved = approvalCards(db.snapshot).find((c) => c.status === "approved");
    if (!approved) throw new Error("fixture");
    renderWithDesk(<ProposalScreen proposalId={approved.proposal_id} />, db);
    expect(await screen.findByRole("heading", { name: /^İmzalandı/ })).not.toHaveFocus();
    const slip = screen.queryByRole("group", { name: /^Emir fişi/ });
    if (slip) expect(slip).not.toHaveClass("oneri-slip-lay");
    expect(screen.getByTestId("human-signature").querySelector("[data-mark=signed]")).not.toHaveClass("oneri-stamp-press");
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
