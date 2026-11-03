import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { engageKillSwitch, stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { approvalCards } from "@/lib/api/mock/selectors";
import { NBSP } from "@/lib/format";
import { DEMO_E3_PROPOSAL, PENDING_PROPOSALS } from "@/mocks/ids";
import { buildExplain } from "@/mocks/explain-builder";
import { DEMO_E3_SPEC } from "@/mocks/runs-demo";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { ProposalScreen } from "./proposal-screen";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });
const plain = (el: HTMLElement) => (el.textContent ?? "").replaceAll(NBSP, " ");

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.pathname = "/benim";
});

describe("Neden?", () => {
  it("opens on the verb and one sentence, then tells the same evidence as a short story", async () => {
    const id = PENDING_PROPOSALS[0];
    renderWithDesk(<ProposalScreen proposalId={id} />);
    const title = await screen.findByRole("heading", { level: 1, name: /kendi hissesini geri aldı\.$/ });
    expect(title).toHaveTextContent(/^AL/);
    expect(screen.getByText("Kararını bekliyor")).toBeInTheDocument();

    for (const chapter of ["Şirket ne duyurdu?", "Benzer durumlarda ne oldu?", "Ne ters gidebilir?", "Paranın ne kadarını kullanır?"]) {
      expect(screen.getByRole("heading", { level: 2, name: chapter })).toBeInTheDocument();
    }
    // Past cases keep their honesty: the sample size in words, no promise.
    await waitFor(() => expect(screen.getByRole("img", { name: /geçmiş olayın \d+ tanesi çizginin üstünde/ })).toBeInTheDocument());
    const story = document.body;
    expect(plain(story)).toMatch(/Benzer \d+ olayın \d+’\w+ hisse 5 gün içinde piyasadan iyi gitti\./);
    expect(plain(story)).toMatch(/\d+ benzer olay var\./);
    expect(plain(story)).toContain("Bu kez kazanç sıfır da olabilir, zarar da.");
    // What could go wrong, and how much of the money it would use.
    await waitFor(() => expect(plain(story)).toMatch(/düşerse satman gerekir; o noktada kaybın yaklaşık [\d.]+ ₺ olur/));
    expect(plain(story)).toContain("Fiyat bir anda sert düşerse kayıp bundan büyük olabilir.");
    expect(plain(story)).toMatch(/yani paranın %[\d,]+’\w+\. Geri kalanına dokunmaz\./);
    expect(plain(story)).toMatch(/borsa günü elinde tutmayı planlıyor\./);
    // A fictional record of the test double has no page at KAP to send anyone to.
    expect(screen.queryByRole("link", { name: /KAP’ta oku/ })).toBeNull();
    expect(plain(story)).not.toMatch(/örnek bir bildirim|deneme hesabı|benzetim/i);
  });

  it("keeps the words anyone can read: no internal step names in the main reading or the details", async () => {
    const u = user();
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[0]} />);
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(screen.getByRole("button", { name: "KAPtan neye baktı?" })).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByRole("list", { name: "KAPtan'ın baktıkları" })).toBeNull();
    await u.click(screen.getByRole("button", { name: "KAPtan neye baktı?" }));
    const looks = screen.getByRole("list", { name: "KAPtan'ın baktıkları" });
    expect(within(looks).getAllByRole("listitem")).toHaveLength(8);
    expect(within(looks).getByText("Karşı görüş ne diyor?")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Teknik kayıt" }));
    expect(screen.getByRole("heading", { name: "Kurallar" })).toBeVisible();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Adım adım" })).toBeVisible());
    expect(document.body.textContent).not.toMatch(/Şüpheci|Uyum|Risk [Kk]apısı|Tayfa|Reddet/);
  });

  it("explains a word where it is read", async () => {
    const u = user();
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[0]} />);
    await u.click(await screen.findByRole("button", { name: "bildirim: ne demek?" }));
    expect(await screen.findByRole("dialog", { name: "bildirim: anlamı" })).toHaveTextContent("resmî açıklama");
  });

  it("Onayla seals the sheet, then it turns into what to enter: copy, Girdim, done", async () => {
    const u = user();
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[0]} />);
    const decide = await screen.findByRole("region", { name: "Kararın" });
    expect(plain(decide)).toContain("Onaylarsan para çıkmaz");
    await u.click(within(decide).getByRole("button", { name: "Onayla" }));
    expect(document.querySelector('[data-seal="ONAYLADIN"]')).toBeInTheDocument();
    const slip = await screen.findByRole("group", { name: /^Bankana gireceğin işlem/ });
    const head = within(slip).getByRole("heading", { name: "Onayladın. İşlem henüz yapılmadı." });
    await waitFor(() => expect(head).toHaveFocus());
    // It opens once, only because it was approved here.
    expect(slip).toHaveClass("oneri-reveal");
    expect(slip).toHaveTextContent("Öneride 1.480 adet yazıyordu.");
    expect(within(slip).getByRole("button", { name: "Kopyala" })).toBeEnabled();
    await u.click(within(slip).getByRole("button", { name: "Girdim" }));
    await u.click(within(slip).getByRole("button", { name: "Kaydet" }));
    expect(await within(slip).findByText(/^Girildi · /)).toBeInTheDocument();
    expect(within(slip).getByRole("link", { name: "Param’da gör →" })).toHaveAttribute("href", "/portfoy");
  });

  it("checks the entry before saving, and Giremedim asks what happened", async () => {
    const u = user();
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[1]} />);
    await u.click(await screen.findByRole("button", { name: "Onayla" }));
    const slip = await screen.findByRole("group", { name: /^Bankana gireceğin işlem/ });
    await u.click(within(slip).getByRole("button", { name: "Girdim" }));
    const qty = within(slip).getByRole("textbox", { name: "Adet" });
    await u.clear(qty);
    await u.type(qty, "999999");
    await u.click(within(slip).getByRole("button", { name: "Kaydet" }));
    expect(within(slip).getByRole("alert")).toHaveTextContent(/fazla olamaz/);
    await u.click(within(slip).getByRole("button", { name: "Vazgeç" }));
    await u.click(within(slip).getByRole("button", { name: "Giremedim" }));
    await u.click(within(slip).getByRole("button", { name: "Girdim, gerçekleşmedi" }));
    // Look the slip up again: the ticket echo can re-render it, and a held node may be stale on slow CI runners.
    await waitFor(() => expect(screen.getByRole("group", { name: /^Bankana gireceğin işlem/ })).toHaveTextContent(/Gerçekleşmedi\. Bu işlem kapandı\./), { timeout: 5_000 });
    expect(screen.queryByRole("button", { name: "Girdim" })).toBeNull();
  });

  it("a refused approval takes the seal off and says why", async () => {
    const u = user();
    const db = new MockDb(null);
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[0]} />, db);
    await screen.findByRole("button", { name: "Onayla" });
    act(() => {
      db.update((s) => ({ ...s, risk: { ...s.risk, halted_today: true } }));
    });
    await u.click(screen.getByRole("button", { name: "Onayla" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Olmadı\. Bugün paran/);
    expect(document.querySelector("[data-seal]")).toBeNull();
    expect(screen.queryByRole("group", { name: /^Bankana gireceğin işlem/ })).toBeNull();
  });

  it("Geç closes it plainly", async () => {
    const u = user();
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[2]} />);
    await u.click(await screen.findByRole("button", { name: "Geç" }));
    const outcome = await screen.findByText("Geçtin.");
    await waitFor(() => expect(outcome).toHaveFocus());
    expect(screen.getByText("İşlem yapılmadı. Kararın Geçmiş'e yazıldı.")).toBeInTheDocument();
  });

  it("takes a note and keeps it with the proposal", async () => {
    const u = user();
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[0]} />, new MockDb(null));
    await u.click(await screen.findByRole("button", { name: "Notlar" }));
    await u.type(screen.getByPlaceholderText("Kısa bir not…"), "Hacim düşük, dikkat.");
    await u.click(screen.getByRole("button", { name: "Not ekle" }));
    expect(await within(await screen.findByRole("list", { name: "Öneri notları" })).findByText("Hacim düşük, dikkat.")).toBeInTheDocument();
  });

  it("drops open proposals while stopped and says why", async () => {
    const db = new MockDb(null);
    engageKillSwitch(db, "user:sen", "test durdurması");
    renderWithDesk(<ProposalScreen proposalId={PENDING_PROPOSALS[0]} />, db);
    expect(await screen.findByText("İptal oldu.")).toBeInTheDocument();
    expect(screen.getByText("Her şey durdurulduğu için bu öneri düştü.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Onayla" })).toBeNull();
  });

  it("shows decided and unknown proposals plainly", async () => {
    const db = new MockDb(null);
    const decided = approvalCards(db.snapshot).find((c) => c.status === "rejected");
    if (!decided) throw new Error("fixture");
    const { unmount } = renderWithDesk(<ProposalScreen proposalId={decided.proposal_id} />, db);
    const said = await screen.findByText("Geçtin.");
    expect(said).not.toHaveFocus();
    unmount();
    renderWithDesk(<ProposalScreen proposalId="prop-yok" />);
    expect(await screen.findByRole("heading", { name: "Bu öneri bulunamadı." })).toBeInTheDocument();
  });

  it("shows an approval from before quietly: no animation", async () => {
    const db = new MockDb(null);
    const approved = approvalCards(db.snapshot).find((c) => c.status === "approved");
    if (!approved) throw new Error("fixture");
    renderWithDesk(<ProposalScreen proposalId={approved.proposal_id} />, db);
    expect(await screen.findByText("Onayladın")).toBeInTheDocument();
    const slip = screen.queryByRole("group", { name: /^Bankana gireceğin işlem/ });
    if (slip) expect(slip).not.toHaveClass("oneri-reveal");
  });

  it("follows a decision made elsewhere", async () => {
    const { db } = renderWithDesk(<ProposalScreen proposalId={DEMO_E3_PROPOSAL} />);
    expect(await screen.findByRole("heading", { name: "Bu öneri bulunamadı." })).toBeInTheDocument();
    const card = buildExplain(DEMO_E3_SPEC).approval;
    if (!card) throw new Error("fixture");
    act(() => {
      db.bus.emit("desk", "approval.decided", { ...card, status: "rejected", decided_at: db.nowIso(), decided_by: "sen" });
    });
    expect(await screen.findByText("Geçtin.")).toBeInTheDocument();
  });
});
