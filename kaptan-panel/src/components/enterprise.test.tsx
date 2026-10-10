import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderWithDesk } from "./harness.test-utils";
import { nav } from "./nav.test-utils";
import { AuditScreen } from "./audit/audit-screen";
import { requestVerify } from "./audit/chain-walk";
import { SettingsScreen } from "./settings/settings-screen";
import { RolePicker } from "./roles/role-picker";
import { GuidedDemo } from "./demo/guided-demo";
import { __resetDemoStore, demoStore, goToStep, startGuidedDemo } from "./demo/demo-store";
import { DEMO_STEPS } from "./demo/demo-steps";
import { Toaster } from "./ui/toast";

vi.mock("next/navigation", async () => (await import("./nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });

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
    expect(within(list).getAllByRole("listitem")).toHaveLength(30);
    expect(within(list).getAllByText(/^Tayfa .* bildirimini okudu\.$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/En yeni 30 kayıt/)).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Daha fazla göster" }));
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Denetim kayıtları" })).getAllByRole("listitem").length).toBeGreaterThan(30));

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

    await u.click(screen.getByRole("button", { name: "Defteri doğrula" }));
    expect(await screen.findByText("Zincir sağlam.", {}, { timeout: 8_000 })).toBeInTheDocument();
    expect(screen.getByTestId("walk-result")).toHaveTextContent("4.812 / 4.812 kayıt yürüdü");
  });

  it("shows the break at #3.907 when a record was tampered with, also when asked by the guided demo", async () => {
    const db = new MockDb(null);
    db.update((s) => ({ ...s, tamperOn: true }));
    renderWithDesk(<AuditScreen />, db, "admin");
    expect(await screen.findByText("Kurcalama testi açık (Ayarlar)")).toBeInTheDocument();
    act(() => requestVerify());
    await waitFor(() => expect(screen.getByTestId("walk-result")).toHaveTextContent("Kayıt #3.907’de zincir kırık."), { timeout: 8_000 });
  });

  it("closes verification to the Analist with the reason", async () => {
    renderWithDesk(<AuditScreen />, new MockDb(null), "analyst");
    expect(await screen.findByRole("button", { name: "Defteri doğrula" })).toBeDisabled();
    expect(screen.getByTestId("denied-audit.verify")).toHaveTextContent("Bunu Risk Sorumlusu ya da Yönetici yapar.");
  });
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
    expect(within(history).getAllByText("Üye 1 önerdi · Üye 3 onayladı", { exact: false })).toHaveLength(2);
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
    await u.click(screen.getByRole("button", { name: "Senaryo ekle: Yeni iş (E3)" }));
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

  it("closes the demo and the team list to the Analist, with reasons", async () => {
    renderWithDesk(<SettingsScreen />, new MockDb(null), "analyst");
    expect(await screen.findByTestId("denied-users.view")).toHaveTextContent("Bunu Yönetici yapar.");
    expect(screen.getByRole("button", { name: "Senaryo ekle: Gizli talimat" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verileri sıfırla" })).toBeDisabled();
    expect(await screen.findByTestId("denied-limits.propose")).toBeInTheDocument();
  });
});

describe("rol seçici", () => {
  it("lists four roles with a line each and switches", async () => {
    const u = user();
    renderWithDesk(
      <>
        <RolePicker />
        <Toaster />
      </>,
      new MockDb(null),
      "risk_officer",
    );
    await u.click(screen.getByRole("button", { name: /Rol: Risk Sorumlusu/ }));
    const items = await screen.findAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual([
      "Analist · Üye 2Okur, not ekler.",
      "Risk Sorumlusu · Üye 3Onaylar ya da reddeder; durdurur.",
      "Yönetici · Üye 1Kullanıcılar, ayarlar, senaryolar.",
      "Denetçi · DenetçiHer şeyi görür, hiçbir şeyi değiştiremez (jüri için).",
    ]);
    await u.click(items[3]!);
    expect(await screen.findByRole("button", { name: /Rol: Denetçi/ })).toBeInTheDocument();
    expect(await screen.findByText("Artık Denetçi gözüyle bakıyorsun.")).toBeInTheDocument();
  });
});

describe("rehberli demo", () => {
  it("starts from Ayarlar, switches roles, opens the screen and walks with the keys", async () => {
    const u = user();
    renderWithDesk(
      <>
        <SettingsScreen />
        <GuidedDemo />
      </>,
      new MockDb(null),
      "risk_officer",
    );
    await u.click(await screen.findByRole("button", { name: "Rehberli turu başlat" }));
    const bar = await screen.findByTestId("guided-demo");
    expect(within(bar).getByTestId("demo-step-title")).toHaveTextContent(DEMO_STEPS[0]!.title);
    expect(bar).toHaveTextContent("Perde 1/6");
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/bugun"));
    await waitFor(() => expect(bar).toHaveTextContent("Rol: Analist"));

    await u.keyboard("{ArrowRight}");
    expect(within(bar).getByTestId("demo-step-title")).toHaveTextContent(DEMO_STEPS[1]!.title);
    await waitFor(() => expect(bar).toHaveTextContent("Rol: Yönetici"));
    await u.keyboard("{ArrowLeft}");
    expect(demoStore.get().index).toBe(0);
    await u.click(within(bar).getByRole("button", { name: "Sonraki adım" }));
    expect(demoStore.get().index).toBe(1);
    await u.click(within(bar).getByRole("button", { name: "Rehberli turu kapat" }));
    expect(screen.queryByTestId("guided-demo")).toBeNull();
  });

  it("offers a backup for a manual step and finishes on the last one", async () => {
    const u = user();
    const db = new MockDb(null);
    db.update((st) => ({
      ...st,
      limitVersions: [
        ...st.limitVersions,
        { ...st.limitVersions[0]!, version: 2, status: "proposed", values: st.limitVersions[0]!.values.map((v) => (v.key === "risk_per_trade_pct" ? { ...v, value: 0.004 } : v)), proposed_by: { uid: "uye-1", name: "Üye 1", role: "admin", at: db.nowIso(), reason: "deneme" }, decided_by: null },
      ],
    }));
    startGuidedDemo();
    act(() => goToStep(DEMO_STEPS.findIndex((st) => st.id === "4g")));
    nav.pathname = "/ayarlar";
    renderWithDesk(<GuidedDemo />, db, "risk_officer");
    const bar = await screen.findByTestId("guided-demo");
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/ayarlar"));
    const backup = within(bar).getByRole("button", { name: "Yedek: onayla (2/2)" });
    await waitFor(() => expect(backup).toBeEnabled());
    await u.click(backup);
    await waitFor(() => expect(db.snapshot.limitVersions.find((v) => v.version === 2)?.status).toBe("active"));

    act(() => goToStep(DEMO_STEPS.length - 1));
    await u.click(await within(bar).findByRole("button", { name: "Turu bitir" }));
    expect(demoStore.get().active).toBe(false);
  });
});
