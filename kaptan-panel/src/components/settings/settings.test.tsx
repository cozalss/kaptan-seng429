import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { SettingsScreen } from "./settings-screen";
import { __resetDemoStore } from "../demo/demo-store";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  __resetDemoStore();
  nav.pathname = "/bugun";
  nav.push.mockReset();
});

describe("Ayarlar · sınırlar", () => {
  it("shows the limits as sentences; Yönetici proposes (1/2), Risk Sorumlusu approves (2/2)", async () => {
    const u = user();
    renderWithDesk(<SettingsScreen />, new MockDb(null), "admin");
    const active = await screen.findByRole("list", { name: "Geçerli sınırlar" });
    expect(within(active).getByText("Bir işlemde en fazla sermayenin %0,5’i riske girer.")).toBeInTheDocument();
    expect(within(active).getByText("Zirveden −%5 düşüşte her şey durur.")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Değişiklik öner" }));
    const form = screen.getByRole("form", { name: "Sınır değişikliği öner" });
    const value = within(form).getByRole("textbox", { name: /Yeni değer/ });
    expect(value).toHaveValue("0,5");
    await u.clear(value);
    await u.type(value, "0,4");
    expect(within(form).getByText("Önerilen: Bir işlemde en fazla sermayenin %0,4’ü riske girer.")).toBeInTheDocument();
    await u.type(within(form).getByRole("textbox", { name: /Neden/ }), "Oynaklık arttı, riski azaltalım.");
    await u.click(within(form).getByRole("button", { name: "Öner (1/2)" }));

    const pending = await screen.findByTestId("limit-pending");
    expect(pending).toHaveTextContent("Bekleyen değişiklik · 1/2 imza");
    expect(screen.getByTestId("limit-stamp-1")).toHaveTextContent("Üye 1 · Yönetici");
    expect(within(pending).getByRole("button", { name: "Onayla (2/2)" })).toBeDisabled();
    await u.click(within(pending).getByRole("button", { name: "Risk Sorumlusu gözüyle bak →" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Onayla (2/2)" })).toBeEnabled());
    await u.click(screen.getByRole("button", { name: "Onayla (2/2)" }));
    await waitFor(() => expect(screen.queryByTestId("limit-pending")).toBeNull());
    expect(await screen.findByText("Bir işlemde en fazla sermayenin %0,4’ü riske girer.")).toBeInTheDocument();
    const history = screen.getByRole("list", { name: "Sınır sürümleri" });
    expect(within(history).getAllByText(/^Üye 1 önerdi \d\d\.\d\d · Üye 3 onayladı, \d\d\.\d\d’(de|da|te|ta) yürürlüğe girdi$/)).toHaveLength(2);
    expect(within(history).getAllByText("yürürlükte")).toHaveLength(1);
  });

  it("shows a refused proposal's reason in the form", async () => {
    const u = user();
    renderWithDesk(<SettingsScreen />, new MockDb(null), "admin");
    await u.click(await screen.findByRole("button", { name: "Değişiklik öner" }));
    const form = screen.getByRole("form", { name: "Sınır değişikliği öner" });
    await u.selectOptions(within(form).getByRole("combobox"), "max_position_pct");
    const value = within(form).getByRole("textbox", { name: /Yeni değer/ });
    await u.clear(value);
    await u.type(value, "20");
    await u.type(within(form).getByRole("textbox", { name: /Neden/ }), "Daha büyük pozisyon istiyorum.");
    await u.click(within(form).getByRole("button", { name: "Öner (1/2)" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(/gevşek olamaz/);
    await u.click(within(form).getByRole("button", { name: "Vazgeç" }));
    expect(screen.getByRole("button", { name: "Değişiklik öner" })).toBeInTheDocument();
  });
});

describe("Ayarlar · ekip ve demo", () => {
  it("lists the team for the Yönetici, builds the table from can(), runs scenarios, the tamper test, a reset and sign-out", async () => {
    const u = user();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const { db } = renderWithDesk(<SettingsScreen />, new MockDb(null), "admin");
    const team = await screen.findByRole("list", { name: "Kullanıcılar" });
    expect(within(team).getAllByRole("listitem")).toHaveLength(5);
    const table = screen.getByRole("table");
    const signRow = within(table).getByRole("row", { name: /Öneriyi imzalar/ });
    expect(within(signRow).getAllByLabelText("evet")).toHaveLength(1);

    await u.click(screen.getByRole("button", { name: "Senaryo ekle: Gizli talimat" }));
    expect(await screen.findByText("Eklendi: Gizli talimat.")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Senaryo ekle: Yeni iş" }));
    expect(await screen.findByRole("link", { name: "Bugün’e git →" })).toHaveAttribute("href", "/bugun");

    const tamper = screen.getByTestId("tamper");
    await waitFor(() => expect(within(tamper).getByRole("button", { name: "Bir kaydı kurcala" })).toBeEnabled());
    await u.click(within(tamper).getByRole("button", { name: "Bir kaydı kurcala" }));
    expect(await within(tamper).findByText("Şu an: kayıt değişik")).toBeInTheDocument();
    expect(db.snapshot.tamperOn).toBe(true);
    await u.click(within(tamper).getByRole("button", { name: "Kurcalamayı geri al" }));
    expect(await within(tamper).findByText("Şu an: defter temiz")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Verileri sıfırla" }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sıfırla" }));
    expect(await screen.findByText("Veriler sıfırlandı.")).toBeInTheDocument();
    expect(db.snapshot.injections).toHaveLength(0);

    await u.click(screen.getByRole("button", { name: "Çıkış" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
    fetchSpy.mockRestore();
  });

  it("closes the scenarios and the team list to the Analist, with reasons", async () => {
    renderWithDesk(<SettingsScreen />, new MockDb(null), "analyst");
    expect(await screen.findByTestId("denied-users.view")).toHaveTextContent("Bunu Yönetici yapar.");
    // The same controls, closed (never hidden), with the reason said once and a way to look as the Yönetici.
    expect(screen.getByTestId("denied-demo.run")).toHaveTextContent("Yönetici gözüyle bak →");
    expect(screen.getByRole("button", { name: "Senaryo ekle: Gizli talimat" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verileri sıfırla" })).toBeDisabled();
    expect(await screen.findByTestId("denied-limits.propose")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Değişiklik öner" })).toBeDisabled();
  });

  it("puts the tour first, links the sections and focuses the one you jump to", async () => {
    const u = user();
    renderWithDesk(<SettingsScreen />, new MockDb(null), "admin");
    const tour = await screen.findByRole("region", { name: "Rehberli tur" });
    const limits = await screen.findByRole("region", { name: "Sınırlar" });
    expect(tour.compareDocumentPosition(limits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(tour).getByRole("button", { name: "Turu başlat" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Bu sayfada" });
    await u.click(within(nav).getByRole("link", { name: "Ekip ve roller" }));
    expect(screen.getByRole("region", { name: "Ekip ve roller" })).toHaveFocus();
    // The table marks the role you look through, with short heads on a phone.
    expect(screen.getByRole("table")).toHaveClass("tone-admin");
    expect(screen.getByRole("columnheader", { name: "Risk Sorumlusu" })).toBeInTheDocument();
  });

  it("says what is missing when the limit form is sent too early, and counts the reason", async () => {
    const u = user();
    renderWithDesk(<SettingsScreen />, new MockDb(null), "admin");
    await u.click(await screen.findByRole("button", { name: "Değişiklik öner" }));
    const form = screen.getByRole("form", { name: "Sınır değişikliği öner" });
    const reason = within(form).getByRole("textbox", { name: "Neden?" });
    expect(reason).toHaveAccessibleDescription(/En az 10 harf; denetim defterine yazılır\. 0\/10/);
    const send = within(form).getByRole("button", { name: "Öner (1/2)" });
    await u.click(send);
    expect(within(form).getByRole("alert")).toHaveTextContent("Gerekçe en az 10 harf olmalı.");
    await u.type(reason, "Kısa");
    expect(within(form).getByText("4/10")).toBeInTheDocument();
  });
});
