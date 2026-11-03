import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import * as sel from "@/lib/api/mock/selectors";
import { NBSP } from "@/lib/format";
import { HOLDS_KEY } from "@/lib/solo/holds";
import { createMockApi } from "@/lib/api/mock/mock-api";
import { ApiProvider } from "@/lib/api/react";
import { MOCK_USER } from "@/lib/auth/mock-user";
import { SessionProvider } from "@/lib/auth/session-context";
import { DeskStateProvider } from "@/components/shell/desk-state";
import { SoloHome } from "./solo-home";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });
const plain = (el: HTMLElement) => (el.textContent ?? "").replaceAll(NBSP, " ");

/** The home on a fresh in-memory state. */
function renderSolo(db: MockDb = new MockDb(null)) {
  __setMockDb(db);
  const api = createMockApi({ db, latencyMs: 0, live: false });
  return {
    db,
    ...render(
      <SessionProvider user={MOCK_USER}>
        <ApiProvider api={api}>
          <DeskStateProvider>
            <SoloHome />
          </DeskStateProvider>
        </ApiProvider>
      </SessionProvider>,
    ),
  };
}

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  window.localStorage.removeItem(HOLDS_KEY);
});

describe("Ana sayfa", () => {
  it("shows the money, the chart, where it sits and the suggestions in plain words", async () => {
    renderSolo();
    expect(await screen.findByRole("heading", { level: 1, name: /Paran bugün .*arttı\./ })).toBeInTheDocument();
    expect(screen.getByText("Paran şu an")).toBeInTheDocument();
    expect(plain(screen.getByTestId("toplam-para"))).toBe("1.018.615,00₺");
    expect(screen.getByText("Başladığından beri")).toBeInTheDocument();
    expect(screen.getByText("Kullanılabilir nakit")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Paranın gün gün değeri" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Son 3 ay: henüz/ })).toBeDisabled();
    const where = screen.getByRole("region", { name: "Param nerede?" });
    expect(within(where).getByText("Nakit")).toBeInTheDocument();
    expect(within(where).getByRole("link", { name: /Farazi Enerji Dağıtım A\.Ş\./ })).toHaveAttribute("href", "/portfoy");
    const list = screen.getByRole("region", { name: "Öneriler" });
    expect(within(list).getByRole("heading", { level: 2, name: "Bugün 6 kararın var." })).toBeInTheDocument();
    // One first decision, with how much, how sure and by when; the rest wait in order.
    const first = within(list).getByRole("article", { name: /^AL Koru Çelik hissesi/ });
    expect(plain(first)).toMatch(/\d adet, tanesi en fazla [\d.,]+ ₺/);
    expect(plain(first)).toContain("KAPtan buna güveniyor, ama garanti değil.");
    expect(plain(first)).toMatch(/Yarın 09:50’ye kadar cevap ver\./);
    expect(plain(first)).toContain("Onaylarsan para çıkmaz");
    expect(within(first).getByRole("link", { name: "Neden? AL KRGCL" })).toHaveAttribute("href", "/oneri/prop-day-e1-krgcl");
    expect(within(list).getAllByRole("article")).toHaveLength(1);
    const queue = within(list).getByRole("list", { name: "Sırada bekleyen öneriler" });
    expect(within(queue).getAllByRole("listitem")).toHaveLength(5);
    expect(within(queue).getByRole("button", { name: "Öne al: TUT FRZEN" })).toBeInTheDocument();
    expect(within(queue).getByRole("button", { name: "Öne al: SAT KRGSG" })).toBeInTheDocument();
    // No jargon on this screen.
    expect(document.body.textContent).not.toMatch(/Sharpe|drawdown|RAG|p95|CAR|R0\d/);
  });

  it("after Onayla the object says the order is not done and what to enter at the bank", async () => {
    const u = user();
    const { db } = renderSolo();
    await u.click(await screen.findByRole("button", { name: "Onayla: AL KRGCL" }));
    // The seal lands at once, before the server has answered.
    expect(document.querySelector('[data-seal="ONAYLADIN"]')).toBeInTheDocument();
    const slip = await screen.findByRole("group", { name: /^Bankana gireceğin işlem/ });
    expect(sel.approvalCards(db.snapshot).find((c) => c.ticker === "KRGCL")?.status).toBe("approved");
    // The truth first.
    expect(slip).toHaveTextContent("Onayladın. İşlem henüz yapılmadı.");
    expect(slip).toHaveTextContent("KAPtan senin yerine işlem yapmaz.");
    expect(slip).toHaveTextContent("uygulamasına sen gir. Sen girmedikçe hiçbir şey olmaz.");
    // What to enter: how many, at most what price, in total; how long it stays valid.
    expect(plain(slip)).toMatch(/Adet\s*509/);
    expect(plain(slip)).toMatch(/Tanesi en fazla\s*34,15 ₺/);
    expect(plain(slip)).toMatch(/Toplam yaklaşık\s*17\.382 ₺/);
    expect(plain(slip)).toContain("Öneride 1.480 adet yazıyordu.");
    expect(plain(slip)).toMatch(/içinde gir\. \d\d:\d\d’(d|t)[ae]n sonra geçmez\./);
    expect(within(slip).getByRole("button", { name: "Kopyala" })).toBeEnabled();
    expect(within(slip).getByRole("button", { name: "Girdim" })).toBeEnabled();
    expect(within(slip).getByRole("button", { name: "Giremedim" })).toBeEnabled();
    // Focus moved with it, the next decision is ready, a screen reader was told.
    await waitFor(() => expect(within(slip).getByRole("heading", { name: "Onayladın. İşlem henüz yapılmadı." })).toHaveFocus());
    expect(screen.getByRole("heading", { level: 2, name: "Önce bu işlemi bankana gir, sonra 5 kararın var." })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: /^AL Misal Çimento hissesi/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Bilgileri bankana sen gireceksin.");
    expect(plain(screen.getByTestId("son-islemler"))).toContain("KRGCL alımını onayladın");

    // Copy, then Girdim with what was seen; the step closes and says so.
    await u.click(within(slip).getByRole("button", { name: "Girdim" }));
    await u.click(within(slip).getByRole("button", { name: "Kaydet" }));
    expect(await within(slip).findByRole("heading", { name: "Girdin. Param’a yazıldı." })).toBeInTheDocument();
    expect(within(slip).getByRole("link", { name: "Param’da gör →" })).toHaveAttribute("href", "/portfoy");
    expect(screen.getByRole("heading", { level: 2, name: "Bugün 5 kararın var." })).toBeInTheDocument();
  });

  it("keeps a waiting order findable on the next visit", async () => {
    const u = user();
    const db = new MockDb(null);
    const first = renderSolo(db);
    await u.click(await screen.findByRole("button", { name: "Onayla: AL KRGCL" }));
    await screen.findByRole("group", { name: /^Bankana gireceğin işlem/ });
    first.unmount();
    renderSolo(db);
    const again = await screen.findByRole("group", { name: /^Bankana gireceğin işlem/ });
    expect(again).toHaveTextContent("KRGCL");
    expect(within(again).getByRole("button", { name: "Girdim" })).toBeEnabled();
  });

  it("a failed approval takes the seal off and brings the object back with the reason", async () => {
    const u = user();
    const db = new MockDb(null);
    renderSolo(db);
    await screen.findByRole("button", { name: "Onayla: AL KRGCL" });
    // A refused approval: already decided elsewhere.
    db.update((s) => ({ ...s, approvals: { ...s.approvals, "prop-day-e1-krgcl": { status: "approved", decided_by: "sen", decided_at: db.nowIso(), decision_comment: null, approved_notional_try: null } } }));
    await u.click(screen.getByRole("button", { name: "Onayla: AL KRGCL" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Olmadı. Bu öneri zaten karara bağlandı ya da süresi doldu.");
    const back = screen.getByRole("article", { name: /^AL Koru Çelik hissesi/ });
    expect(within(back).getByRole("button", { name: "Onayla: AL KRGCL" })).toBeEnabled();
    expect(document.querySelector("[data-seal]")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /^Bankana gireceğin işlem/ })).not.toBeInTheDocument();
    expect(within(back).getByRole("heading", { level: 3 })).toHaveFocus();
  });

  it("shows the bank step at once under reduced motion", async () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() }));
    vi.stubGlobal("matchMedia", matchMedia);
    const timers = vi.spyOn(globalThis, "setTimeout");
    const u = user();
    renderSolo();
    await u.click(await screen.findByRole("button", { name: "Onayla: AL KRGCL" }));
    await screen.findByRole("group", { name: /^Bankana gireceğin işlem/ });
    // Nothing waited for the seal's 380 ms.
    expect(timers.mock.calls.map(([, ms]) => ms)).not.toContain(380);
    timers.mockRestore();
    vi.unstubAllGlobals();
  });

  it("Geç declines a suggestion; a TUT answer is recorded by the API and hidden here", async () => {
    const u = user();
    const { db } = renderSolo();
    // Any waiting suggestion comes forward from the queue; the keyboard lands on it.
    await u.click(await screen.findByRole("button", { name: "Öne al: AL ORNCM" }));
    const orncm = screen.getByRole("article", { name: /^AL Misal Çimento hissesi/ });
    await waitFor(() => expect(within(orncm).getByRole("heading", { level: 3 })).toHaveFocus());
    await u.click(within(orncm).getByRole("button", { name: "Geç: AL ORNCM" }));
    // Gone in the same frame: the next one is up before the server has answered.
    expect(screen.queryByRole("button", { name: "Geç: AL ORNCM" })).not.toBeInTheDocument();
    await waitFor(() => expect(sel.approvalCards(db.snapshot).find((c) => c.ticker === "ORNCM")?.status).toBe("rejected"));
    await waitFor(() => expect(plain(screen.getByTestId("son-islemler"))).toContain("ORNCM önerisini geçtin"));
    expect(screen.queryByRole("group", { name: /^Bankana gireceğin işlem/ })).not.toBeInTheDocument();
    // A TUT is just a line: nothing to enter at any bank.
    await u.click(screen.getByRole("button", { name: "Öne al: TUT FRZEN" }));
    await u.click(screen.getByRole("button", { name: "Onayla: TUT FRZEN" }));
    expect(await screen.findByText("FRZEN elinde kalıyor.")).toBeInTheDocument();
    expect(screen.getByText("Yapman gereken bir şey yok.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /^Bankana gireceğin işlem/ })).not.toBeInTheDocument();
    expect(db.snapshot.auditAppends.at(-1)).toMatchObject({ action: "suggestion.held", entity_id: "tut-FRZEN", payload: { ticker: "FRZEN" } });
    await waitFor(() => expect(plain(screen.getByTestId("son-islemler"))).toContain("FRZEN elinde kalıyor"));
    expect(window.localStorage.getItem(HOLDS_KEY)).toContain("tut-FRZEN");
  });

  it("the emergency stop asks first, then stops everything and closes the suggestions", async () => {
    const u = user();
    const { db } = renderSolo();
    await u.click(await screen.findByRole("button", { name: "Tüm işlemleri durdur" }));
    const dialog = await screen.findByRole("dialog", { name: "Tüm işlemler durdurulsun mu?" });
    await u.click(within(dialog).getByRole("button", { name: "Vazgeç" }));
    expect(db.snapshot.risk.kill_switch).toBe("off");
    await u.click(screen.getByRole("button", { name: "Tüm işlemleri durdur" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Evet, durdur" }));
    expect(await screen.findByRole("heading", { name: "Tüm işlemler durduruldu" })).toBeInTheDocument();
    expect(db.snapshot.risk.kill_switch).toBe("on");
    // What is left on the desk stays readable, with its buttons closed and the reason next to them.
    const sheet = within(screen.getByRole("region", { name: "Öneriler" })).getByRole("article");
    expect(sheet).toHaveTextContent("İşlemler durduruldu. Yeniden başlatana kadar öneri onaylanamaz; elindeki hisseler yerinde duruyor.");
    expect(sheet).toHaveTextContent("Şimdilik kapalı");
    for (const b of within(sheet).getAllByRole("button", { name: /^(Onayla|Geç): / })) expect(b).toBeDisabled();

    // The same person restarts: request (1/2) and confirm (2/2) in one go, the waiver on the ledger.
    await u.click(screen.getByRole("button", { name: "İşlemleri yeniden başlat" }));
    await u.click(within(await screen.findByRole("dialog", { name: "İşlemler yeniden başlasın mı?" })).getByRole("button", { name: "Evet, yeniden başlat" }));
    expect(await screen.findByRole("heading", { name: "Acil durum" })).toBeInTheDocument();
    expect(db.snapshot.risk.kill_switch).toBe("off");
    expect(db.snapshot.auditAppends.map((e) => e.action).slice(-3)).toEqual(["kill_switch.reset_started", "auth.single_user_waiver", "kill_switch.reset"]);
  });

});

