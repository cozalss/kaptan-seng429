import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { __setMockDb } from "@/lib/api/mock/db";
import { renderAs, stubReducedMotion } from "@/components/admin/harness.test.utils";
import { AuditScreen } from "./audit-screen";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/audit",
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  stubReducedMotion();
  search = "";
  replace.mockReset();
});
afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
});

describe("AuditScreen", () => {
  it("lists the newest entries and verifies the chain for the Auditor", async () => {
    const user = userEvent.setup({ delay: null });
    renderAs("auditor", <AuditScreen />);
    expect(await screen.findByRole("cell", { name: "4.812" }, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kurcalama testi" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Zinciri doğrula" }));
    expect(await screen.findByText(/4\.812 kayıt · hash zinciri geçerli/, undefined, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Denetlenen kurallar" })).toHaveTextContent("Sıra: geçti");
  });

  it("lets the Admin tamper, then reports the break at #3.907 and jumps to it", async () => {
    const user = userEvent.setup({ delay: null });
    renderAs("admin", <AuditScreen />);
    await user.click(await screen.findByRole("button", { name: "Kurcalama testi" }));
    expect(await screen.findByText(/Kurcalama açık/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Zinciri doğrula" }));
    expect(await screen.findByText(/Kayıt #3\.907'de zincir kırık/, undefined, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Denetlenen kurallar" })).toHaveTextContent("İçerik: kırık");
    await user.click(screen.getByRole("button", { name: /Kırık kayda git/ }));
    expect(replace).toHaveBeenCalledWith("/audit?pos=3907", { scroll: false });
    await user.click(screen.getByRole("button", { name: "Kurcalamayı geri al" }));
    expect(await screen.findByRole("button", { name: "Kurcalama testi" })).toBeInTheDocument();
  });

  it("opens a deep-linked entry with its hash link and steps to neighbours", async () => {
    search = "pos=4000";
    const user = userEvent.setup({ delay: null });
    renderAs("analyst", <AuditScreen />);
    const dialog = await screen.findByRole("dialog", { name: "Kayıt #4.000" });
    expect(within(dialog).getByText(/saklanan hash ile eşleşiyor/)).toBeInTheDocument();
    expect(within(dialog).getByText("Payload (JSON)")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Sonraki kayıt (daha eski)" }));
    expect(await screen.findByRole("dialog", { name: "Kayıt #3.999" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zinciri doğrula", hidden: true })).toBeDisabled();
  });

  it("filters through the URL and shows the empty state", async () => {
    search = "entity=yok-boyle-bir-sey";
    const user = userEvent.setup({ delay: null });
    renderAs("risk_officer", <AuditScreen />);
    expect(await screen.findByText("Bu filtreyle kayıt yok.")).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Eylem" }), "limits.");
    expect(replace).toHaveBeenLastCalledWith("/audit?action=limits.&entity=yok-boyle-bir-sey", { scroll: false });
    await user.click(screen.getByRole("button", { name: "Temizle" }));
    expect(replace).toHaveBeenLastCalledWith("/audit", { scroll: false });
  });

  it("filters a run and auto-verifies from ?dogrula", async () => {
    search = "run=run-day-e2-orncm&dogrula=1";
    renderAs("auditor", <AuditScreen />);
    expect(await screen.findByText(/hash zinciri geçerli/, undefined, { timeout: 6000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("run-day-e2-orncm").length).toBeGreaterThan(1));
    await act(async () => {
      screen.getByRole("button", { name: "Run filtresini kaldır" }).click();
    });
    expect(replace).toHaveBeenLastCalledWith("/audit", { scroll: false });
  });
});
