import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { AuditScreen } from "./audit-screen";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });
/** Every record row on screen (folded runs included), by its chain id. */
const records = (list: HTMLElement) => Array.from(list.querySelectorAll<HTMLElement>("[id^=kayit-]"));

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.pathname = "/gecmis";
  nav.push.mockReset();
});

describe("Geçmiş", () => {
  it("reads the ledger as plain sentences, filters, searches and verifies the chain", async () => {
    const u = user();
    renderWithDesk(<AuditScreen />, new MockDb(null));
    expect(await screen.findByRole("heading", { level: 1, name: /^Geçmiş\.\s*Bugün [\d.]+ şey oldu; hepsi burada\.$/ })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Geçmiş kayıtları" });
    expect(records(list)).toHaveLength(30);
    expect(within(list).getAllByText(/^.* bildirimini okudu\.$/).length).toBeGreaterThan(0);
    // The day opens the diary; routine reads fold into one line that opens to the originals.
    expect(within(list).getByRole("heading", { level: 2, name: "Bugün" })).toBeInTheDocument();
    expect(within(list).getAllByText(/^\d+ duyuru okudu\.$/).length).toBeGreaterThan(0);
    // Hashes and record numbers stay behind "Ayrıntılar".
    expect(within(list).getAllByText("Ayrıntılar").length).toBeGreaterThan(0);
    expect(screen.getByText(/En yeni 30 kayıt/)).toHaveAttribute("role", "status");

    await u.click(screen.getByRole("button", { name: "Daha eskisini göster" }));
    await waitFor(() => expect(records(screen.getByRole("list", { name: "Geçmiş kayıtları" })).length).toBeGreaterThan(30));

    await u.click(screen.getByRole("button", { name: "Tümü" }));
    expect(screen.getByRole("button", { name: "Tümü" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByText(/toplam 4\.812/)).toBeInTheDocument());

    await u.type(screen.getByRole("searchbox", { name: "Geçmişte ara" }), "onayladın");
    await waitFor(() => {
      const rows = within(screen.getByRole("list", { name: "Geçmiş kayıtları" })).getAllByRole("listitem");
      expect(rows.every((r) => /onayladın/.test(r.textContent ?? ""))).toBe(true);
    });
    await u.clear(screen.getByRole("searchbox", { name: "Geçmişte ara" }));
    await u.type(screen.getByRole("searchbox", { name: "Geçmişte ara" }), "hiçyokböyleşey");
    expect(await screen.findByText("Bu aramaya uyan kayıt yok.")).toBeInTheDocument();

    await u.clear(screen.getByRole("searchbox", { name: "Geçmişte ara" }));
    await u.type(screen.getByRole("searchbox", { name: "Geçmişte ara" }), "#4.000");
    await waitFor(() => expect(records(screen.getByRole("list", { name: "Geçmiş kayıtları" })).map((r) => r.id)).toEqual(["kayit-4000"]));

    await u.click(screen.getByRole("button", { name: "Kayıtlar sağlam mı?" }));
    expect(await screen.findByText("Kayıtlar sağlam.", {}, { timeout: 8_000 })).toBeInTheDocument();
    expect(screen.getByTestId("walk-result")).toHaveTextContent("4.812/ 4.812 kayıt kontrol edildi");
    expect(screen.getByText("4.812 kaydın hiçbiri değişmemiş. Kayıtlar sağlam.")).toHaveAttribute("role", "status");
  });

  it("shows the break at #3.907 when a record was tampered with", async () => {
    const db = new MockDb(null);
    db.update((s) => ({ ...s, tamperOn: true }));
    renderWithDesk(<AuditScreen />, db);
    await userEvent.setup({ delay: null }).click(await screen.findByRole("button", { name: "Kayıtlar sağlam mı?" }));
    await waitFor(() => expect(screen.getByTestId("walk-result")).toHaveTextContent("Kayıt 3.907’de bozulma var."), { timeout: 8_000 });
    expect(screen.getByTestId("walk-result")).toHaveTextContent("Bu kayıt yazıldıktan sonra biri onu değiştirmiş");
    expect(screen.getByTestId("walk-result")).toHaveTextContent("Ondan önceki 3.906 kayıt sağlam.");

    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Kaydı göster →" }));
    expect(screen.getByRole("button", { name: "Tümü" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox", { name: "Geçmişte ara" })).toHaveValue("#3907");
    await waitFor(() => expect(document.getElementById("kayit-3907")).toHaveFocus());
  });

});
