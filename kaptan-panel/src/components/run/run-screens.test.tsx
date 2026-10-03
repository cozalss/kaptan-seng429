import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "@/components/shell/app-shell";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import type { SessionUser } from "@/lib/auth/session-context";
import type { DemoScenario } from "@/mocks/ids";
import { RunDetail } from "./run-detail";
import { RunsList } from "./runs-list";

const push = vi.fn();
const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/runs",
  useSearchParams: () => new URLSearchParams(search),
}));

const RISK: SessionUser = { uid: "u-risk", email: "risk@kaptan.demo", name: "Zeynep (Risk Officer)", role: "risk_officer" };
const AUDITOR: SessionUser = { uid: "u-denetci", email: "denetci@kaptan.demo", name: "Hoca (Auditor)", role: "auditor" };
const ADMIN: SessionUser = { uid: "u-admin", email: "admin@kaptan.demo", name: "Burak (Admin)", role: "admin" };

let db: MockDb;
function inject(scenario: DemoScenario, agoMs = 60_000) {
  db.update((s) => ({ ...s, injections: [...s.injections, { scenario, atMs: Date.now() - agoMs }] }));
  db.audit("user:u-admin", "demo.injected", "scenario", scenario, { fixture: true }, `run-demo-${scenario === "e3_contract" ? "e3-ornek" : scenario === "redteam_injection" ? "redteam-dmogd" : "r04-tmslj"}`);
}

beforeEach(() => {
  db = new MockDb(null);
  __setMockDb(db);
  search = "";
  push.mockReset();
  replace.mockReset();
});
afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
});

describe("RunDetail — Neden bu işlem?", () => {
  it("rebuilds the E3 demo run: verdict, path, sections and the embedded ticket", async () => {
    inject("e3_contract");
    render(
      <AppShell user={RISK}>
        <RunDetail runId="run-demo-e3-ornek" />
      </AppShell>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Neden bu işlem?" })).toBeInTheDocument();
    await screen.findByText("Öneri · onay bekliyor");
    const path = screen.getByRole("navigation", { name: "Karar yolu" });
    expect(within(path).getByText("İnsan onayı")).toBeInTheDocument();
    expect(screen.getByText("Öneri · onay bekliyor")).toBeInTheDocument();
    for (const name of ["Bildirim", "Ön eleme ve koruma", "Sınıflandırma", "Kanıt kartı", "Şüpheci", "Kural izi", "Uyum", "Risk kapısı R01–R16", "İnsan onayı", "Ajan izi"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText("E3.materiality")).toBeInTheDocument();
    expect(screen.getAllByText("Kill switch").length).toBeGreaterThan(0);
    expect(screen.getByText(/panelde yeniden hesaplandı/)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "Emir fişi · kişisel mod" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Koşunun tüm audit kayıtları/ })).toHaveAttribute("href", "/audit?run=run-demo-e3-ornek");
    for (const l of screen.queryAllByRole("link", { name: /^#\d/ })) expect(l.getAttribute("href")).toMatch(/^\/audit\?pos=\d+$/);
    // Risk Officer can jump to the queue.
    expect(screen.getAllByRole("link", { name: "Onay kuyruğunda aç" })[0]).toHaveAttribute("href", "/approvals?oneri=prop-demo-e3-ornek");
  });

  it("switches the disclosure to EN, opens the event table and the JSON view", async () => {
    inject("e3_contract");
    const user = userEvent.setup({ delay: null });
    render(
      <AppShell user={RISK}>
        <RunDetail runId="run-demo-e3-ornek" />
      </AppShell>,
    );
    await screen.findByText("Öneri · onay bekliyor");
    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByText(/Alıntılar Türkçe metin üzerinden/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Olay tablosunu göster/ }));
    expect(screen.getByRole("table", { name: /benzer geçmiş olaylar/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "JSON" }));
    expect(await screen.findByRole("dialog", { name: "Karar kayıtları (JSON)" })).toBeInTheDocument();
    expect(screen.getByLabelText("TradeProposal JSON")).toHaveTextContent("prop-demo-e3-ornek");
  });

  it("shows the red-team run as quarantined and never at the rule engine", async () => {
    inject("redteam_injection");
    render(
      <AppShell user={AUDITOR}>
        <RunDetail runId="run-demo-redteam-dmogd" />
      </AppShell>,
    );
    expect(await screen.findByText("Karantina · kural motoruna ulaşmadı")).toBeInTheDocument();
    expect(screen.getByText(/Kural motoruna ulaşmadı: metin karantinada kaldı/)).toBeInTheDocument();
    expect(screen.getByTitle(/Gizli talimat kalıbı/)).toHaveTextContent(/SİSTEM NOTU/);
    // Auditor: read-only note form.
    expect(await screen.findByRole("textbox", { name: /Not ekle/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Notu kaydet" })).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the R04 hard veto with zero LLM calls", async () => {
    inject("restricted_r04");
    render(
      <AppShell user={RISK}>
        <RunDetail runId="run-demo-r04-tmslj" />
      </AppShell>,
    );
    expect(await screen.findByText("Sert veto · R04 · LLM çağrısı 0")).toBeInTheDocument();
    expect(screen.getByText("SERT VETO · LLM çağrısı 0")).toBeInTheDocument();
    expect(screen.getByText(/ön elemede LLM'den önce çalıştı/)).toBeInTheDocument();
  });

  it("streams a live run node by node", async () => {
    inject("e3_contract", 1_000);
    render(
      <AppShell user={RISK}>
        <RunDetail runId="run-demo-e3-ornek" />
      </AppShell>,
    );
    expect(await screen.findByText("Canlı · graf çalışıyor")).toBeInTheDocument();
    act(() => {
      db.bus.emit("run:run-demo-e3-ornek", "node", { node: "route", phase: "start", at: new Date().toISOString(), latency_ms: null, tokens_in: null, tokens_out: null });
    });
    expect(await screen.findByText(/Yönlendirme başladı/)).toBeInTheDocument();
    act(() => {
      db.bus.emit("run:run-demo-e3-ornek", "interrupt", { proposal_id: "prop-demo-e3-ornek" });
    });
    expect(await screen.findByText(/interrupt\(\) → onay bekliyor/)).toBeInTheDocument();
  });

  it("offers the Admin to start a demo run that has not been injected yet", async () => {
    render(
      <AppShell user={ADMIN}>
        <RunDetail runId="run-demo-r04-tmslj" />
      </AppShell>,
    );
    expect(await screen.findByText("Bu demo çalıştırması henüz başlamadı")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Senaryoyu başlat" })).toBeInTheDocument();
  });

  it("says plainly when a run id does not exist (no inject button for others)", async () => {
    render(
      <AppShell user={RISK}>
        <RunDetail runId="run-yok" />
      </AppShell>,
    );
    expect(await screen.findByText("Çalıştırma bulunamadı")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Senaryoyu başlat" })).toBeNull();
  });

  it("lets an Analyst add a note", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <AppShell user={{ ...RISK, uid: "u-analist", name: "Mert (Analist)", role: "analyst" }}>
        <RunDetail runId="run-day-e1-tmsmk" />
      </AppShell>,
    );
    const box = await screen.findByRole("textbox", { name: /Not ekle/ });
    await user.click(screen.getByRole("button", { name: "Notu kaydet" }));
    expect(await screen.findByText("Not boş olamaz.")).toBeInTheDocument();
    await user.type(box, "Dolum fiyatı limitin altında.");
    await user.click(screen.getByRole("button", { name: "Notu kaydet" }));
    await waitFor(() => expect(screen.getByText("Dolum fiyatı limitin altında.")).toBeInTheDocument());
    expect(screen.getByText(/89,60 TL/)).toBeInTheDocument();
  });
});

describe("RunsList", () => {
  it("lists runs with the outcome bar and opens a row", async () => {
    inject("redteam_injection");
    const user = userEvent.setup({ delay: null });
    render(
      <AppShell user={RISK}>
        <RunsList />
      </AppShell>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Çalıştırmalar" })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: /Çalıştırmalar/ });
    expect(within(table).getAllByText("DMOGD").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /Karantina/ }));
    expect(replace).toHaveBeenCalledWith("/runs?sonuc=QUARANTINED", { scroll: false });
    const row = within(table).getAllByRole("row")[1] as HTMLElement;
    await user.click(row);
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/runs\/run-/));
  });

  it("applies the URL filter and shows the empty state when nothing matches", async () => {
    search = "q=hiçyok";
    render(
      <AppShell user={RISK}>
        <RunsList />
      </AppShell>,
    );
    expect(await screen.findByText("Bu süzgece uyan koşu yok")).toBeInTheDocument();
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getAllByRole("button", { name: "Süzgeci temizle" })[0] as HTMLElement);
    expect(replace).toHaveBeenCalled();
  });

  it("filters by status and period from the selects", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <AppShell user={RISK}>
        <RunsList />
      </AppShell>,
    );
    await screen.findByRole("table", { name: /Çalıştırmalar/ });
    await user.selectOptions(screen.getByRole("combobox", { name: "Durum" }), "interrupted");
    expect(replace).toHaveBeenLastCalledWith("/runs?durum=interrupted", { scroll: false });
    await user.selectOptions(screen.getByRole("combobox", { name: "Dönem" }), "history");
    expect(replace).toHaveBeenLastCalledWith("/runs?kapsam=history", { scroll: false });
    await user.click(screen.getByRole("checkbox", { name: "Yalnızca demo fikstürü" }));
    expect(replace).toHaveBeenLastCalledWith("/runs?demo=1", { scroll: false });
  });
});
