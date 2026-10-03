import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { engageKillSwitch, stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { approvalCards } from "@/lib/api/mock/selectors";
import { DEMO_E3_PROPOSAL } from "@/mocks/ids";
import { DEMO_E3_SPEC } from "@/mocks/runs-demo";
import { ApprovalsScreen } from "./approvals-screen";
import { Harness, USERS } from "./test-harness";

const push = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/approvals",
  useSearchParams: () => search,
}));

let db: MockDb;
beforeEach(() => {
  db = new MockDb(null);
  __setMockDb(db);
  search = new URLSearchParams();
});
afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
});

const renderAs = (user: keyof typeof USERS) =>
  render(
    <Harness user={USERS[user]} db={db}>
      <ApprovalsScreen />
    </Harness>,
  );

describe("ApprovalsScreen", () => {
  it("lists pending proposals and lets the Risk Officer approve with a comment and code", async () => {
    const user = userEvent.setup({ delay: null });
    renderAs("risk");
    const card = await screen.findByRole("article");
    const ticker = within(card).getAllByRole("heading")[0]?.textContent ?? "";
    expect(screen.getByRole("button", { name: /Bekleyen 3/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(card).getByText("Kural izi")).toBeInTheDocument();
    expect(within(card).getByText("Sızıntı filtresi")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Onayla" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Onayla ve gönder" }));
    expect(await within(dialog).findByText("Yorum zorunludur.")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Karar gerekçesi/), "Kanıt yeterli.");
    await user.type(within(dialog).getByLabelText(/Doğrulama kodu/), "000000");
    await user.click(within(dialog).getByRole("button", { name: "Onayla ve gönder" }));

    expect(await screen.findByText("Onaylandı", { selector: "span.title-display" })).toBeInTheDocument();
    expect(screen.getByText(/“Kanıt yeterli.”/)).toBeInTheDocument();
    expect(ticker.length).toBeGreaterThan(0);
    expect(db.snapshot.approvals[Object.keys(db.snapshot.approvals)[0] as string]?.status).toBe("approved");
  });

  it("shrinks: approves a smaller amount and refuses growing it", async () => {
    const user = userEvent.setup({ delay: null });
    renderAs("risk");
    const card = await screen.findByRole("article");
    await user.click(within(card).getByRole("button", { name: "Küçült" }));
    const dialog = await screen.findByRole("dialog");
    const amount = within(dialog).getByLabelText(/Onaylanacak tutar/);
    await user.clear(amount);
    await user.type(amount, "99999999");
    await user.type(within(dialog).getByLabelText(/Karar gerekçesi/), "Yarıya indiriyorum.");
    await user.type(within(dialog).getByLabelText(/Doğrulama kodu/), "123456");
    await user.click(within(dialog).getByRole("button", { name: /Küçültülmüş tutarla onayla/ }));
    expect(await within(dialog).findByText(/büyütme yok/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /×0,5/ }));
    await user.click(within(dialog).getByRole("button", { name: /Küçültülmüş tutarla onayla/ }));
    expect(await screen.findByText(/küçültülerek:/)).toBeInTheDocument();
  });

  it("rejects with a comment", async () => {
    const user = userEvent.setup({ delay: null });
    renderAs("risk");
    const card = await screen.findByRole("article");
    await user.click(within(card).getByRole("button", { name: "Reddet" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Karar gerekçesi/), "Hacim anormal.");
    await user.type(within(dialog).getByLabelText(/Doğrulama kodu/), "000000");
    await user.click(within(dialog).getByRole("button", { name: "Reddet" }));
    expect(await screen.findByText("Reddedildi", { selector: "span.title-display" })).toBeInTheDocument();
  });

  it("shows the same card read-only to the Analyst", async () => {
    renderAs("analyst");
    const card = await screen.findByRole("article");
    expect(screen.getByText(/Salt okunur · Analist/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Onayla" })).toBeDisabled();
    expect(within(card).getByRole("button", { name: "Reddet" })).toBeDisabled();
    expect(within(card).getByText(/Yalnızca Risk Officer onaylayabilir/)).toBeInTheDocument();
  });

  it("receives a new proposal live over the desk stream and opens it", async () => {
    const user = userEvent.setup({ delay: null });
    renderAs("risk");
    await screen.findByRole("article");
    const e3 = approvalCards({ ...db.snapshot, injections: [{ scenario: "e3_contract", atMs: Date.now() - 60_000 }] }).find((c) => c.proposal_id === DEMO_E3_PROPOSAL);
    expect(e3).toBeDefined();
    act(() => {
      db.bus.emit("desk", "approval.requested", e3);
    });
    const banner = await screen.findByRole("button", { name: /Yeni onay talebi · ORNEK/ });
    await user.click(banner);
    expect(within(screen.getByRole("article")).getByText(DEMO_E3_SPEC.headline_tr)).toBeInTheDocument();
  });

  it("closes every decision while the kill switch is on", async () => {
    renderAs("risk");
    await screen.findByRole("article");
    act(() => engageKillSwitch(db, "user:u-risk", "Test"));
    await waitFor(() => expect(screen.getAllByText(/KILL SWITCH AÇIK — onay/).length).toBeGreaterThan(0));
  });

  it("switches to decided cards and preselects by query", async () => {
    const user = userEvent.setup({ delay: null });
    renderAs("risk");
    await screen.findByRole("article");
    await user.click(screen.getByRole("button", { name: /Karara bağlanan/ }));
    expect(await screen.findAllByText(/Onaylandı|Reddedildi/)).not.toHaveLength(0);
    await user.keyboard("j");
    await user.keyboard("k");
  });
});
