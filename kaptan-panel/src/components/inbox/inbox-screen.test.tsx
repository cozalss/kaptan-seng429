import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { visibleDisclosures } from "@/lib/api/mock/selectors";
import { DEMO_E3_INDEX, DEMO_R04_INDEX } from "@/mocks/ids";
import { Harness, USERS } from "@/components/approvals/test-harness";
import { InboxScreen } from "./inbox-screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

let db: MockDb;
beforeEach(() => {
  db = new MockDb(null);
  __setMockDb(db);
  push.mockReset();
});
afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
});

const renderAs = (user: keyof typeof USERS) =>
  render(
    <Harness user={USERS[user]} db={db}>
      <InboxScreen />
    </Harness>,
  );

async function table() {
  return screen.findByRole("table");
}

describe("InboxScreen", () => {
  it("shows the counter sentence, the funnel, the LLM cost and the day's rows", async () => {
    renderAs("analyst");
    const t = await table();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Canlı akış/i);
    expect(await screen.findByText(/itibarıyla/, { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hat hunisi" })).toBeInTheDocument();
    expect(screen.getByText(/Bugün: 31 çağrı · ~0,4M token/)).toBeInTheDocument();
    expect(within(t).getAllByRole("row").length).toBeGreaterThan(100);
  });

  it("filters by search and noise, and offers to clear", async () => {
    const user = userEvent.setup({ delay: null });
    renderAs("analyst");
    const t = await table();
    const before = within(t).getAllByRole("row").length;
    await user.click(screen.getByLabelText(/Gürültüyü göster/));
    expect(within(t).getAllByRole("row").length).toBeGreaterThan(before);
    await user.type(screen.getByLabelText(/Sembol, şirket ya da konu ara/), "zzzz-yok");
    expect(await screen.findByText("Filtreye uyan bildirim yok")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Filtreleri temizle" })[0] as HTMLElement);
    expect(await table()).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Sınıf (E-kodu)"), "X");
    await user.selectOptions(screen.getByLabelText("Rota"), "avoid");
    await user.selectOptions(screen.getByLabelText("Bildirim türü"), "all");
    expect(within(await table()).getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("triages from the keyboard: / searches, j/k move, Enter opens the drawer", async () => {
    const user = userEvent.setup({ delay: null });
    renderAs("analyst");
    await table();
    await user.keyboard("/");
    expect(screen.getByLabelText(/Sembol, şirket ya da konu ara/)).toHaveFocus();
    await user.keyboard("{Escape}");
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("j");
    await user.keyboard("j");
    await user.keyboard("k");
    const selected = document.querySelector('tr[aria-selected="true"]');
    expect(selected).not.toBeNull();
    await user.keyboard("{Enter}");
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("Ön eleme")).toBeInTheDocument();
    expect(await within(drawer).findByText(/Bildirim metni/)).toBeInTheDocument();
    await user.keyboard("j");
    await user.keyboard("{Escape}");
  });

  it("sets down a live disclosure with a 'yeni' mark and applies its classification", async () => {
    renderAs("analyst");
    await table();
    const e3 = visibleDisclosures({ ...db.snapshot, injections: [{ scenario: "e3_contract", atMs: Date.now() }] }).find((d) => d.disclosure_index === DEMO_E3_INDEX);
    act(() => {
      db.bus.emit("feed", "disclosure", e3);
    });
    const row = await waitFor(() => {
      const r = document.getElementById(`bildirim-${DEMO_E3_INDEX}`);
      if (!r) throw new Error("not yet");
      return r;
    });
    expect(within(row).getByLabelText("yeni")).toBeInTheDocument();
    expect(within(row).getByText("DEMO FİKSTÜRÜ")).toBeInTheDocument();
    expect(within(row).getByText("Sınıflandırılıyor…")).toBeInTheDocument();
    act(() => {
      db.bus.emit("feed", "classification", { disclosure_index: DEMO_E3_INDEX, event_type: "E3", confidence: 0.93 });
      db.bus.emit("feed", "news_linked", { disclosure_index: DEMO_E3_INDEX, count: 3 });
    });
    await waitFor(() => expect(within(row).getByText("0,93")).toBeInTheDocument());
    expect(within(row).getByLabelText("3 bağlı haber")).toBeInTheDocument();
  });

  it("opens a processed row with its run, pre-gate veto and lets an analyst add a note", async () => {
    const user = userEvent.setup({ delay: null });
    db.update((s) => ({ ...s, injections: [{ scenario: "restricted_r04", atMs: Date.now() - 60_000 }] }));
    renderAs("analyst");
    await table();
    await user.click(document.getElementById(`bildirim-${DEMO_R04_INDEX}`) as HTMLElement);
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByText(/Sert veto/)).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: /Neden bu işlem/ })).toHaveAttribute("href", expect.stringContaining("/runs/"));
    await user.type(within(drawer).getByLabelText("Yeni not"), "Tedbirli hisse, izlemede.");
    await user.click(within(drawer).getByRole("button", { name: "Not ekle" }));
    expect(await within(drawer).findByText("Tedbirli hisse, izlemede.")).toBeInTheDocument();
  });

  it("keeps the auditor read-only and shows the Admin the scenario menu", async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = renderAs("auditor");
    const t = await table();
    await user.click(within(t).getAllByRole("row")[1] as HTMLElement);
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByRole("button", { name: "Not ekle" })).toBeDisabled();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Senaryo" })).toBeDisabled();
    unmount();
    renderAs("admin");
    await table();
    await user.click(screen.getByRole("button", { name: /Senaryo menüsü/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Tedbirli hisse/ }));
    await waitFor(() => expect(db.snapshot.injections.some((i) => i.scenario === "restricted_r04")).toBe(true));
  });
});
