import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { AuditScreen } from "./audit-screen";
import { requestVerify } from "./chain-walk";
import { __resetDemoStore } from "../demo/demo-store";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });
/** Every record row on screen (folded runs included), by its chain id. */
const records = (list: HTMLElement) => Array.from(list.querySelectorAll<HTMLElement>("[id^=kayit-]"));

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  __resetDemoStore();
  nav.pathname = "/bugun";
  nav.push.mockReset();
});

describe("Denetim", () => {
  it("reads the ledger as plain sentences, filters, searches and verifies the chain", async () => {
    const u = user();
    renderWithDesk(<AuditScreen />, new MockDb(null), "auditor");
    expect(await screen.findByRole("heading", { level: 1, name: "Her adım bir deftere yazılır." })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Denetim kayıtları" });
    expect(records(list)).toHaveLength(30);
    expect(within(list).getAllByText(/^KAP okuyucu .* bildirimini getirdi\.$/).length).toBeGreaterThan(0);
    // The KAP okuyucu's routine fetches fold into one line that opens to the originals.
    expect(within(list).getAllByText(/^KAP okuyucu \d+ bildirim getirdi\.$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/En yeni 30 kayıt/)).toHaveAttribute("role", "status");

    await u.click(screen.getByRole("button", { name: "Daha fazla göster" }));
    await waitFor(() => expect(records(screen.getByRole("list", { name: "Denetim kayıtları" })).length).toBeGreaterThan(30));

    await u.click(screen.getByRole("button", { name: "Tümü" }));
    expect(screen.getByRole("button", { name: "Tümü" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByText(/defterin tamamı 4\.812/)).toBeInTheDocument());

    await u.type(screen.getByRole("searchbox", { name: "Defterde ara" }), "imzaladı");
    await waitFor(() => {
      const rows = within(screen.getByRole("list", { name: "Denetim kayıtları" })).getAllByRole("listitem");
      expect(rows.every((r) => /imzaladı/.test(r.textContent ?? ""))).toBe(true);
    });
    await u.clear(screen.getByRole("searchbox", { name: "Defterde ara" }));
    await u.type(screen.getByRole("searchbox", { name: "Defterde ara" }), "hiçyokböyleşey");
    expect(await screen.findByText("Bu aramaya uyan kayıt yok.")).toBeInTheDocument();

    await u.clear(screen.getByRole("searchbox", { name: "Defterde ara" }));
    await u.type(screen.getByRole("searchbox", { name: "Defterde ara" }), "#4.000");
    await waitFor(() => expect(records(screen.getByRole("list", { name: "Denetim kayıtları" })).map((r) => r.id)).toEqual(["kayit-4000"]));

    await u.click(screen.getByRole("button", { name: "Defteri doğrula" }));
    expect(await screen.findByText("Zincir sağlam.", {}, { timeout: 8_000 })).toBeInTheDocument();
    expect(screen.getByTestId("walk-result")).toHaveTextContent("4.812 / 4.812 kayıt yürüdü");
    expect(screen.getByText("4.812 kaydın hiçbiri değişmemiş. Zincir sağlam.")).toHaveAttribute("role", "status");
  });

  it("shows the break at #3.907 when a record was tampered with, also when asked by the guided demo", async () => {
    const db = new MockDb(null);
    db.update((s) => ({ ...s, tamperOn: true }));
    renderWithDesk(<AuditScreen />, db, "admin");
    expect(await screen.findByText("Kurcalama testi açık (Ayarlar)")).toBeInTheDocument();
    act(() => requestVerify());
    await waitFor(() => expect(screen.getByTestId("walk-result")).toHaveTextContent("Kayıt #3.907’de zincir kırık."), { timeout: 8_000 });
    expect(screen.getByTestId("walk-result")).toHaveTextContent("Bu kaydın şimdiki parmak izi zincirdekiyle tutmuyor.");

    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Defterde göster →" }));
    expect(screen.getByRole("button", { name: "Tümü" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox", { name: "Defterde ara" })).toHaveValue("#3907");
    await waitFor(() => expect(document.getElementById("kayit-3907")).toHaveFocus());
  });

  it("closes verification to the Analist with the reason", async () => {
    renderWithDesk(<AuditScreen />, new MockDb(null), "analyst");
    expect(await screen.findByRole("button", { name: "Defteri doğrula" })).toBeDisabled();
    expect(screen.getByTestId("denied-audit.verify")).toHaveTextContent("Bunu Risk Sorumlusu ya da Yönetici yapar.");
  });
});
