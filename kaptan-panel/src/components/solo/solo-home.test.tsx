import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import * as sel from "@/lib/api/mock/selectors";
import { NBSP } from "@/lib/format";
import { HOLDS_KEY } from "@/lib/solo/holds";
import { actorFor, createMockApi } from "@/lib/api/mock/mock-api";
import { ApiProvider } from "@/lib/api/react";
import { SessionProvider } from "@/lib/auth/session-context";
import type { Role } from "@/lib/domain/user";
import { SoloHome } from "./solo-home";
import { SoloModeProvider } from "./solo-mode";

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
    expect(screen.getByRole("slider", { name: "Paranın gün gün değeri" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Son 3 ay: henüz/ })).toBeDisabled();
    const where = screen.getByRole("region", { name: "Param nerede?" });
    expect(within(where).getByText("Nakit")).toBeInTheDocument();
    expect(within(where).getByText("Farazi Enerji Dağıtım A.Ş.")).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "Öneriler" });
    expect(within(list).getByRole("heading", { name: /^AL — KRGCL/ })).toBeInTheDocument();
    // Each AL/SAT row says how much and at what price (the desk's own numbers).
    expect(plain(list)).toMatch(/\d lot · en fazla [\d.,]+ ₺/);
    expect(within(list).queryByRole("heading", { name: /^TUT — FRZEN/ })).not.toBeInTheDocument();
    await user().click(within(list).getByRole("button", { name: "Tümünü gör (6)" }));
    expect(within(list).getByRole("heading", { name: /^TUT — FRZEN/ })).toBeInTheDocument();
    expect(within(list).getByRole("heading", { name: /^SAT — KRGSG/ })).toBeInTheDocument();
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
    // Five left: the rest open from the header.
    await u.click(screen.getByRole("button", { name: "Tümünü gör (5)" }));
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

/** The personal view of a team desk: the same home, the signed-in role's rights. */
function renderTeam(role: Role, db: MockDb = new MockDb(null)) {
  __setMockDb(db);
  const actor = actorFor(role);
  const api = createMockApi({ getActor: () => actor, db, latencyMs: 0, live: false, singleUser: false });
  return {
    db,
    ...render(
      <SessionProvider user={actor}>
        <SoloModeProvider singleUser={false}>
          <ApiProvider api={api}>
            <SoloHome />
          </ApiProvider>
        </SoloModeProvider>
      </SessionProvider>,
    ),
  };
}

describe("Kişisel mod on a team desk", () => {
  it("lets the Risk Sorumlusu sign the second signature from here", async () => {
    const u = user();
    const { db } = renderTeam("risk_officer");
    const list = await screen.findByRole("region", { name: "Öneriler" });
    expect(within(list).getAllByText(/İkinci imza gerekir: onaylarsan senin adınla atılır/).length).toBeGreaterThan(0);
    await u.click(screen.getByRole("button", { name: "Onayla: AL KRGCL" }));
    await waitFor(() => expect(sel.approvalCards(db.snapshot).find((c) => c.ticker === "KRGCL")?.status).toBe("approved"));
  });

  it("keeps the Denetçi read-only with the plain reason", async () => {
    renderTeam("auditor");
    const list = await screen.findByRole("region", { name: "Öneriler" });
    expect(within(list).getByText(/Denetçi yalnızca bakar/)).toBeInTheDocument();
    expect(within(list).getAllByText(/İkinci imza gerekir: Risk Sorumlusu onaylar/).length).toBeGreaterThan(0);
    for (const b of within(list).getAllByRole("button", { name: /^(Onayla|Geç): / })) expect(b).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tüm işlemleri durdur" })).toBeDisabled();
  });

  it("splits the restart: the Yönetici stops and asks (1/2), the Risk Sorumlusu confirms (2/2)", async () => {
    const u = user();
    const db = new MockDb(null);
    const admin = renderTeam("admin", db);
    await u.click(await screen.findByRole("button", { name: "Tüm işlemleri durdur" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Evet, durdur" }));
    await u.click(await screen.findByRole("button", { name: "Yeniden başlatmayı iste (1/2)" }));
    await u.click(within(await screen.findByRole("dialog", { name: "Yeniden başlatma istensin mi?" })).getByRole("button", { name: "Evet, iste" }));
    await waitFor(() => expect(db.snapshot.auditAppends.at(-1)?.action).toBe("kill_switch.reset_started"));
    expect(await screen.findByText(/Risk Sorumlusu onayı bekleniyor/)).toBeInTheDocument();
    expect(db.snapshot.risk.kill_switch).toBe("on");
    admin.unmount();

    renderTeam("risk_officer", db);
    expect(await screen.findByText(/yeniden başlatmayı istedi \(1\/2\)/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Yeniden başlatmayı onayla (2/2)" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Evet, onayla" }));
    expect(await screen.findByRole("heading", { name: "Acil durum" })).toBeInTheDocument();
    expect(db.snapshot.risk.kill_switch).toBe("off");
  });
});
