import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import * as sel from "@/lib/api/mock/selectors";
import { NBSP } from "@/lib/format";
import { HOLDS_KEY } from "@/lib/solo/holds";
import { actorFor, createMockApi } from "@/lib/api/mock/mock-api";
import { ApiProvider } from "@/lib/api/react";
import { SoloHome } from "./solo-home";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });
const plain = (el: HTMLElement) => (el.textContent ?? "").replaceAll(NBSP, " ");

/** The home on a fresh in-memory desk, in single-user mode (one person, every permission). */
function renderSolo(db: MockDb = new MockDb(null)) {
  __setMockDb(db);
  const api = createMockApi({ getActor: () => actorFor("risk_officer"), db, latencyMs: 0, live: false, singleUser: true });
  return {
    db,
    ...render(
      <ApiProvider api={api}>
        <SoloHome />
      </ApiProvider>,
    ),
  };
}

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  window.localStorage.removeItem(HOLDS_KEY);
});

describe("Benim KAPtan'ım", () => {
  it("shows the money, the chart, where it sits and the suggestions in plain words", async () => {
    renderSolo();
    expect(await screen.findByRole("heading", { name: "Paran şu an" })).toBeInTheDocument();
    expect(plain(screen.getByTestId("toplam-para"))).toBe("1.018.615,00₺");
    expect(screen.getByText("Başladığından beri")).toBeInTheDocument();
    expect(screen.getByText("Kullanılabilir nakit")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Paranın yolculuğu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Son 3 ay: henüz/ })).toBeDisabled();
    const where = screen.getByRole("region", { name: "Param nerede?" });
    expect(within(where).getByText("Nakit")).toBeInTheDocument();
    expect(within(where).getByText("Farazi Enerji Dağıtım A.Ş.")).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "Öneriler" });
    expect(within(list).getByRole("heading", { name: /^AL — KRGCL/ })).toBeInTheDocument();
    expect(within(list).getByRole("heading", { name: /^SAT — KRGSG/ })).toBeInTheDocument();
    expect(within(list).queryByRole("heading", { name: /^TUT — FRZEN/ })).not.toBeInTheDocument();
    await user().click(within(list).getByRole("button", { name: "2 öneri daha göster" }));
    expect(within(list).getByRole("heading", { name: /^TUT — FRZEN/ })).toBeInTheDocument();
    expect(within(list).getAllByText("Güçlü").length).toBeGreaterThan(0);
    // No jargon on this screen.
    expect(document.body.textContent).not.toMatch(/Sharpe|drawdown|RAG|p95|CAR|R0\d/);
  });

  it("approving a buy runs the approval and lands in Son işlemler", async () => {
    const u = user();
    const { db } = renderSolo();
    await u.click(await screen.findByRole("button", { name: "Onayla: AL KRGCL" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Onayla: AL KRGCL" })).not.toBeInTheDocument());
    const done = sel.approvalCards(db.snapshot).find((c) => c.ticker === "KRGCL");
    expect(done?.status).toBe("approved");
    expect(plain(screen.getByTestId("son-islemler"))).toContain("KRGCL alımını onayladın");
  });

  it("Geç declines a suggestion; a TUT answer is recorded by the API and hidden here", async () => {
    const u = user();
    const { db } = renderSolo();
    await u.click(await screen.findByRole("button", { name: "Geç: AL ORNCM" }));
    await waitFor(() => expect(sel.approvalCards(db.snapshot).find((c) => c.ticker === "ORNCM")?.status).toBe("rejected"));
    await waitFor(() => expect(plain(screen.getByTestId("son-islemler"))).toContain("ORNCM önerisini geçtin"));
    // Five left: the list is no longer folded.
    expect(screen.queryByRole("button", { name: /öneri daha göster/ })).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Onayla: TUT FRZEN" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Onayla: TUT FRZEN" })).not.toBeInTheDocument());
    expect(db.snapshot.auditAppends.at(-1)).toMatchObject({ action: "suggestion.held", entity_id: "tut-FRZEN", payload: { ticker: "FRZEN" } });
    expect(plain(screen.getByTestId("son-islemler"))).toContain("FRZEN elinde kalıyor");
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
    expect(screen.getByText("İşlemler durduruldu; öneriler şimdilik onaylanamaz.")).toBeInTheDocument();
    for (const b of screen.queryAllByRole("button", { name: /^Onayla: / })) expect(b).toBeDisabled();

    // The same person restarts: request (1/2) and confirm (2/2) in one go, the waiver on the ledger.
    await u.click(screen.getByRole("button", { name: "İşlemleri yeniden başlat" }));
    await u.click(within(await screen.findByRole("dialog", { name: "İşlemler yeniden başlasın mı?" })).getByRole("button", { name: "Evet, yeniden başlat" }));
    expect(await screen.findByRole("heading", { name: "Acil durum" })).toBeInTheDocument();
    expect(db.snapshot.risk.kill_switch).toBe("off");
    expect(db.snapshot.auditAppends.map((e) => e.action).slice(-3)).toEqual(["kill_switch.reset_started", "auth.single_user_waiver", "kill_switch.reset"]);
  });

  it("shows the reason on the card when an approval is refused", async () => {
    const db = new MockDb(null);
    renderSolo(db);
    await screen.findByRole("heading", { name: "Paran şu an" });
    // A refused approval (already decided elsewhere) shows its reason on the card.
    db.update((s) => ({ ...s, approvals: { ...s.approvals, "prop-day-e1-krgcl": { status: "approved", decided_by: "uye-2", decided_role: "risk_officer", decided_at: db.nowIso(), decision_comment: null, approved_notional_try: null } } }));
    await user().click(screen.getByRole("button", { name: "Onayla: AL KRGCL" }));
    expect(await screen.findByText("Bu öneri zaten karara bağlandı ya da süresi doldu.")).toBeInTheDocument();
  });
});
