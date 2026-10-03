import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockDb, __setMockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderAs } from "@/components/admin/harness.test.utils";
import { LimitsScreen } from "./limits-screen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/limits",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
});

describe("LimitsScreen", () => {
  it("shows the active version, history and the v1 → v2 diff", async () => {
    renderAs("analyst", <LimitsScreen />);
    expect(await screen.findByRole("heading", { name: "Geçerli sürüm · v1" })).toBeInTheDocument();
    expect(screen.getByText("Kanonik başlangıç limitleri (rules-v1.0 ön kaydı ile birlikte).")).toBeInTheDocument();
    const diff = screen.getByRole("table", { name: "v1 → v2 karşılaştırması" });
    expect(within(diff).getByText("daha gevşek · daha çok risk")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Değişiklik öner" })).toBeDisabled();
  });

  it("runs the four-eyes flow: propose (Admin) → blocked for the proposer → approved by a Risk Officer", async () => {
    const user = userEvent.setup({ delay: null });
    const db = new MockDb(null);
    const first = renderAs("admin", <LimitsScreen />, db);
    const propose = await screen.findByRole("button", { name: "Değişiklik öner" });
    await waitFor(() => expect(propose).toBeEnabled());
    await user.click(propose);
    const dialog = await screen.findByRole("dialog", { name: "Limit değişikliği öner" });
    await user.click(within(dialog).getByRole("button", { name: "Öneriyi gönder (1/2)" }));
    expect(within(dialog).getByText("En az bir değer değiştirin.")).toBeInTheDocument();
    const input = within(dialog).getByRole("textbox", { name: /Fiyat bandı/ });
    await user.clear(input);
    await user.type(input, "abc");
    expect(within(dialog).getByText(/Sayı girin/)).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "3");
    await user.type(within(dialog).getByRole("textbox", { name: /Gerekçe/ }), "Bant genişletme denemesi (test).");
    await user.click(within(dialog).getByRole("button", { name: "Öneriyi gönder (1/2)" }));
    expect(await screen.findByRole("heading", { name: "v3 · 1 limit değişiyor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onayla (2/2)" })).toBeDisabled();
    expect(screen.getAllByText("Öneren onaylayamaz (dört göz).").length).toBeGreaterThan(0);
    first.unmount();

    renderAs("risk_officer", <LimitsScreen />, db);
    await user.click(await screen.findByRole("button", { name: "Onayla (2/2)" }));
    const decide = await screen.findByRole("dialog", { name: "v3 önerisini onayla" });
    await user.click(within(decide).getByRole("button", { name: "Onayla ve yürürlüğe al" }));
    expect(within(decide).getByText("Yorum zorunludur.")).toBeInTheDocument();
    await user.type(within(decide).getByRole("textbox", { name: /Yorum/ }), "Onay.");
    await user.click(within(decide).getByRole("button", { name: "Onayla ve yürürlüğe al" }));
    expect(await screen.findByRole("heading", { name: "Geçerli sürüm · v3" })).toBeInTheDocument();
  });

  it("lets a Risk Officer reject a proposal and confirm a block-list removal", async () => {
    const user = userEvent.setup({ delay: null });
    const db = new MockDb(null);
    db.update((s) => ({
      ...s,
      restricted: s.restricted.map((r) => (r.ticker === "KRGTK" ? { ...r, removal_requested_by: "u-admin" } : r)),
      limitVersions: [...s.limitVersions, { ...s.limitVersions[0]!, version: 3, status: "proposed", created_by: "u-admin", approved_by: null, approved_by_name: null, approved_at: null, effective_from: null }],
    }));
    renderAs("risk_officer", <LimitsScreen />, db);
    await user.click(await screen.findByRole("button", { name: "Reddet" }));
    const dlg = await screen.findByRole("dialog", { name: "v3 önerisini reddet" });
    await user.type(within(dlg).getByRole("textbox", { name: /Yorum/ }), "Gerek yok.");
    await user.click(within(dlg).getByRole("button", { name: "Reddet" }));
    expect(await screen.findByRole("heading", { name: "Geçerli sürüm · v1" })).toBeInTheDocument();
    expect(screen.queryByText(/limit değişiyor/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Çıkarmayı onayla (2/2)" }));
    const confirm = await screen.findByRole("dialog", { name: /KRGTK engel listesinden/ });
    await user.type(within(confirm).getByRole("textbox", { name: /yazın/ }), "KRGTK");
    await user.click(within(confirm).getByRole("button", { name: "Çıkarmayı onayla" }));
    expect(await screen.findByText(/Bekleyen çıkarma talebi yok/)).toBeInTheDocument();
  });
});
