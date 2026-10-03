import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { demoStore, __resetDemoStore } from "@/components/demo/demo-store";
import { renderAs } from "./harness.test.utils";
import { AdminScreen, tabFromParam } from "./admin-screen";

const push = vi.fn();
const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
});
afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  __resetDemoStore();
});

describe("AdminScreen", () => {
  it("defaults to the demo tab in demo mode and starts the guided demo", async () => {
    search = "";
    const user = userEvent.setup({ delay: null });
    renderAs("admin", <AdminScreen />);
    expect(tabFromParam(null)).toBe("demo");
    expect(tabFromParam("evren")).toBe("evren");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Yönetim");
    await user.click(screen.getByRole("button", { name: "Rehberli demoyu başlat" }));
    expect(demoStore.get().active).toBe(true);
    await user.click(screen.getAllByRole("button", { name: "Enjekte et" })[0]!);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/runs/run-demo-e3-ornek"));
    await user.click(screen.getAllByRole("button", { name: "Enjekte et" })[3]!);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/portfolio"));
    await user.click(screen.getByRole("tab", { name: "Evren" }));
    expect(replace).toHaveBeenCalledWith("/admin?sekme=evren", { scroll: false });
  });

  it("lists users with the permission matrix", async () => {
    search = "sekme=kullanicilar";
    renderAs("admin", <AdminScreen />);
    expect(await screen.findByText("Hoca (Auditor)")).toBeInTheDocument();
    expect(screen.getByText("Kendi rolünüzü değiştiremezsiniz.")).toBeInTheDocument();
    const matrix = screen.getByRole("table", { name: "Rol başına izinler" });
    expect(within(matrix).getByRole("rowheader", { name: /Öneri onay/ })).toBeInTheDocument();
  });

  it("filters the universe", async () => {
    search = "sekme=evren";
    const user = userEvent.setup({ delay: null });
    renderAs("admin", <AdminScreen />);
    expect(await screen.findByText("ÖRNEK ENERJİ A.Ş.")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Ara" }), "zzzz");
    expect(await screen.findByText("Eşleşen sembol yok.")).toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "Ara" }));
    await user.click(screen.getByRole("checkbox", { name: "Yalnızca evrendekiler" }));
    expect(screen.getAllByText("içinde").length).toBeGreaterThan(0);
  });

  it("adds to the block list immediately and opens a removal request (1/2)", async () => {
    search = "sekme=engel";
    const user = userEvent.setup({ delay: null });
    const { db } = renderAs("admin", <AdminScreen />);
    expect(await screen.findByText("TMSLJ")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Engel listesine ekle" }));
    expect(screen.getByText("Sembol gerekli.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /Sembol/ }), "krgmd");
    await user.click(screen.getByRole("button", { name: "Engel listesine ekle" }));
    expect(await screen.findByText("KRGMD")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Çıkarma talebi aç" })[0]!);
    expect(await screen.findByText(/Çıkarma talebi 1\/2/)).toBeInTheDocument();
    expect(db.snapshot.restricted.some((r) => r.removal_requested_by === "u-admin")).toBe(true);
  });

  it("keeps live mode off in mock mode and shows read-only config", async () => {
    search = "sekme=sistem";
    renderAs("admin", <AdminScreen />);
    expect(await screen.findByText("Canlı mod KAPALI")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Canlı mod" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Mock\/demo modunda canlı mod her zaman kapalıdır/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "K3: canlı modu başlat (1/2)" })).toBeDisabled();
    expect(await screen.findByText("rules-v1.0")).toBeInTheDocument();
    expect(screen.getByText("v1.1-fwd")).toBeInTheDocument();
  });
});
