import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { SettingsScreen } from "./settings-screen";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  nav.pathname = "/ayarlar";
  nav.push.mockReset();
});

describe("Ayarlar · sınırlar", () => {
  it("shows the limits as sentences and changes one in a single action", async () => {
    const u = user();
    const { db } = renderWithDesk(<SettingsScreen />, new MockDb(null));
    const active = await screen.findByRole("list", { name: "Geçerli sınırlar" });
    expect(within(active).getByText("Bir işlemde en fazla paranın %0,5’i riske girer.")).toBeInTheDocument();
    expect(within(active).getByText("Paran en yüksek hâlinden %5 düşerse her şey durur.")).toBeInTheDocument();
    // What it comes to for you, in lira, from the real money.
    expect(await within(active).findByText(/^Bugünkü paranla: bir işlemde .* ₺ kadar\.$/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /^Ayarlar\.\s*Paranı 8 sınır koruyor\.$/ })).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Değiştir: Bir işlemin riski" }));
    const form = screen.getByRole("form", { name: "Sınırı değiştir" });
    const value = within(form).getByRole("textbox", { name: /yeni değer/ });
    expect(value).toHaveValue("0,5");
    await u.clear(value);
    await u.type(value, "0,4");
    expect(within(form).getByText(/^Yeni hali: Bir işlemde en fazla paranın %0,4’ü riske girer\./)).toBeInTheDocument();
    await u.type(within(form).getByRole("textbox", { name: /Neden/ }), "Oynaklık arttı, riski azaltalım.");
    await u.click(within(form).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
    expect(screen.queryByTestId("limit-pending")).toBeNull();
    expect(await within(screen.getByRole("list", { name: "Geçerli sınırlar" })).findByText("Bir işlemde en fazla paranın %0,4’ü riske girer.")).toBeInTheDocument();
    const history = screen.getByRole("list", { name: "Sınır sürümleri" });
    expect(within(history).getAllByText(/^\d\d\.\d\d’(de|da|te|ta) yürürlüğe girdi$/)).toHaveLength(2);
    expect(within(history).getAllByText("yürürlükte")).toHaveLength(1);
    expect(db.snapshot.auditAppends.map((a) => a.action)).toEqual(expect.arrayContaining(["limits.proposed", "auth.single_user_waiver", "limits.approved"]));
  });

  it("shows a refused change's reason in the form", async () => {
    const u = user();
    renderWithDesk(<SettingsScreen />, new MockDb(null));
    await u.click(await screen.findByRole("button", { name: "Değiştir: Tek hisseye giden" }));
    const form = screen.getByRole("form", { name: "Sınırı değiştir" });
    const value = within(form).getByRole("textbox", { name: /yeni değer/ });
    await u.clear(value);
    await u.type(value, "20");
    await u.type(within(form).getByRole("textbox", { name: /Neden/ }), "Daha büyük bir tutar istiyorum.");
    await u.click(within(form).getByRole("button", { name: "Kaydet" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(/gevşek olamaz/);
    await u.click(screen.getByRole("button", { name: "Vazgeç: Tek hisseye giden" }));
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("finishes or drops a change whose second step failed", async () => {
    const u = user();
    const db = new MockDb(null);
    const first = db.snapshot.limitVersions[0]!;
    const by = { uid: "sen", name: "Deniz", at: db.nowIso(), reason: "yarım kaldı" };
    db.update((s) => ({
      ...s,
      limitVersions: [...s.limitVersions, { ...first, version: 2, status: "proposed", proposed_by: by, decided_by: null, values: first.values.map((v) => (v.key === "max_position_pct" ? { ...v, value: 0.08 } : v)) }],
    }));
    renderWithDesk(<SettingsScreen />, db);
    const pending = await screen.findByTestId("limit-pending");
    expect(pending).toHaveTextContent("Yarım kalan değişiklik");
    await u.click(within(pending).getByRole("button", { name: "Uygula" }));
    await waitFor(() => expect(screen.queryByTestId("limit-pending")).toBeNull());
  });

  it("says what is missing when the form is sent too early, and counts the reason", async () => {
    const u = user();
    renderWithDesk(<SettingsScreen />, new MockDb(null));
    await u.click(await screen.findByRole("button", { name: "Değiştir: Bir işlemin riski" }));
    const form = screen.getByRole("form", { name: "Sınırı değiştir" });
    const reason = within(form).getByRole("textbox", { name: "Neden?" });
    expect(reason).toHaveAccessibleDescription(/En az 10 harf; Geçmiş'e yazılır\. 0\/10/);
    await u.click(within(form).getByRole("button", { name: "Kaydet" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Neden en az 10 harf olmalı.");
    await u.type(reason, "Kısa");
    expect(within(form).getByText("4/10")).toBeInTheDocument();
  });
});

describe("Ayarlar · hesap", () => {
  it("signs out, and reopens how KAPtan works", async () => {
    const u = user();
    const opened = vi.fn();
    window.addEventListener("kaptan:how-it-works", opened);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    renderWithDesk(<SettingsScreen />, new MockDb(null));
    await u.click(await screen.findByRole("button", { name: "Yeniden göster" }));
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener("kaptan:how-it-works", opened);
    await u.click(screen.getByRole("button", { name: "Çıkış yap" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/login"));
    vi.unstubAllGlobals();
  });
});

describe("Ayarlar is a live product's settings", () => {
  it("has no scenarios, no tamper test and no reset", async () => {
    renderWithDesk(<SettingsScreen />, new MockDb(null));
    await screen.findByRole("list", { name: "Geçerli sınırlar" });
    expect(screen.queryByRole("button", { name: /Senaryo|kurcala|sıfırla/i })).toBeNull();
    expect(document.body).not.toHaveTextContent(/deneme|senaryo|kurcala/i);
  });
});
