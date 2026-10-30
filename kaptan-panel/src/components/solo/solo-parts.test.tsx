import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider } from "@/lib/api/react";
import { ApiError, type KaptanApi } from "@/lib/api/types";
import { NBSP } from "@/lib/format";
import type { Allocation, Suggestion } from "@/lib/solo/overview";
import { nav } from "../nav.test-utils";
import { Activity } from "./activity";
import { AllocationPanel, allocationRows } from "./allocation";
import { MoneyChart } from "./money-chart";
import { SoloHome } from "./solo-home";
import { afterLogin, SoloLoginForm, SoloLoginScreen } from "./solo-login";
import { SoloShell } from "./solo-shell";
import { orderSuggestions, Suggestions } from "./suggestions";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });
const plain = (t: string | null | undefined) => (t ?? "").replaceAll(NBSP, " ");

const alloc = (symbol: string, amount: number, pnl = 0.01): Allocation => ({ symbol, name: `${symbol} A.Ş.`, amount, weight: amount / 1_000_000, pnl_pct: pnl });

afterEach(() => {
  vi.unstubAllGlobals();
  nav.replace.mockClear();
});

describe("Param nerede?", () => {
  it("gives six holdings their own ink and folds the rest into Diğer on the bar", () => {
    const many = ["A", "B", "C", "D", "E", "F", "G"].map((s, i) => alloc(s, 70_000 - i * 1_000));
    const { bar, list } = allocationRows(many, 500_000, 1_000_000);
    expect(bar.map((r) => r.label)).toEqual(["A", "B", "C", "D", "E", "Diğer (2)", "Nakit"]);
    expect(list).toHaveLength(8);
    expect(list.filter((r) => r.fill === "other").map((r) => r.label)).toEqual(["F", "G"]);
    const six = allocationRows(many.slice(0, 6), 0, 1_000_000);
    expect(six.bar.filter((r) => r.fill === "slot")).toHaveLength(6);
    expect(allocationRows([], 10, 0).list[0]?.share).toBe(0);
  });

  it("names every part with amount, share and gain; says so when everything is cash", () => {
    const { rerender } = render(<AllocationPanel allocations={[alloc("FRZEN", 50_000, 0.05)]} cash={950_000} total={1_000_000} />);
    const row = screen.getByRole("row", { name: /FRZEN/ });
    expect(plain(row.textContent)).toContain("50.000 ₺");
    expect(plain(row.textContent)).toContain("+%5");
    expect(screen.getByRole("img", { name: /FRZEN %5, Nakit %95/ })).toBeInTheDocument();
    rerender(<AllocationPanel allocations={[]} cash={1_000_000} total={1_000_000} />);
    expect(screen.getByText("Henüz hisse yok; paranın tamamı nakitte.")).toBeInTheDocument();
  });
});

describe("Paranın yolculuğu", () => {
  const series = Array.from({ length: 120 }, (_, i) => ({
    date: new Date(Date.parse("2026-09-14T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10),
    equity: 1_000_000 + i * 500,
  }));

  it("switches period and reads values with the keyboard and the pointer", async () => {
    const u = user();
    render(<MoneyChart series={series} capitalStart={1_000_000} />);
    const readout = screen.getByTestId("grafik-okuma");
    expect(plain(readout.textContent)).toBe("Bugün1.059.500 ₺");
    await u.click(screen.getByRole("button", { name: "Son 1 ay" }));
    expect(screen.getByRole("button", { name: "Son 1 ay" })).toHaveAttribute("aria-pressed", "true");
    const slider = screen.getByRole("slider", { name: "Paranın gün gün değeri" });
    slider.focus();
    await u.keyboard("{Home}");
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    await u.keyboard("{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    await u.keyboard("x");
    slider.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 100, right: 300, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(slider, { clientX: 0 });
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    fireEvent.pointerLeave(slider);
    expect(plain(readout.textContent)).toContain("Bugün");
    await u.click(screen.getByText("Tablo olarak göster"));
    expect(screen.getAllByRole("row").length).toBeGreaterThan(20);
  });

  it("says so when there is not enough history to draw", () => {
    render(<MoneyChart series={[{ date: "2027-01-11", equity: 1_000_000 }]} capitalStart={1_000_000} />);
    expect(screen.getByText("Grafik için en az iki günlük kayıt gerekiyor.")).toBeInTheDocument();
  });
});

describe("Öneriler and Son işlemler", () => {
  const s = (id: string, action: Suggestion["action"], confidence: number): Suggestion => ({ id, symbol: id.toUpperCase(), action, reason_short: "Bir sebep.", confidence, expires_at: null });

  it("orders buys, sells, holds and the strongest first", () => {
    expect(orderSuggestions([s("t", "tut", 0.9), s("s", "sat", 0.5), s("a", "al", 0.5), s("b", "al", 0.8)]).map((x) => x.id)).toEqual(["b", "a", "s", "t"]);
  });

  it("shows an empty state and a card's own error", () => {
    const { rerender } = render(<Suggestions suggestions={[]} names={new Map()} stopped={false} busy={null} errors={{}} onAnswer={vi.fn()} />);
    expect(screen.getByText(/Şu an yeni öneri yok/)).toBeInTheDocument();
    rerender(<Suggestions suggestions={[s("x", "al", 0.3)]} names={new Map()} stopped={false} busy={{ id: "x", answer: "approve" }} errors={{ x: "Olmadı." }} onAnswer={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Olmadı.");
    expect(screen.getByText("Zayıf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onayla: AL X" })).toHaveTextContent("Onaylanıyor…");
  });

  it("has an empty Son işlemler", () => {
    render(<Activity items={[]} />);
    expect(screen.getByText(/Henüz işlem yok/)).toBeInTheDocument();
  });
});

describe("loading and errors", () => {
  it("shows a plain error and a retry when the home cannot be read", async () => {
    const failing = {
      overview: () => Promise.reject(new ApiError(503, "down", "Servis şu an kapalı.")),
      riskStatus: () => new Promise(() => {}),
      listApprovals: () => new Promise(() => {}),
      positions: () => new Promise(() => {}),
    } as unknown as KaptanApi;
    render(
      <ApiProvider api={failing}>
        <SoloHome />
      </ApiProvider>,
    );
    expect(screen.getByRole("status", { name: "Yükleniyor" })).toBeInTheDocument();
    expect(await screen.findByText("Servis şu an kapalı.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yeniden dene" })).toBeInTheDocument();
  });
});

describe("sign-in", () => {
  it("goes to the simple home unless a safe next was given", () => {
    expect(afterLogin(null)).toBe("/benim");
    expect(afterLogin("/portfoy")).toBe("/portfoy");
    expect(afterLogin("//evil.example")).toBe("/benim");
  });

  it("has one password field, fills the mock password and signs in", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ redirect: "/bugun" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const u = user();
    render(<SoloLoginScreen next={null} />);
    expect(screen.getByRole("heading", { name: "Benim KAPtan'ım" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Giriş yap" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Parola gerekli.");
    await u.click(screen.getByRole("button", { name: "Doldur" }));
    await u.click(screen.getByRole("button", { name: "Giriş yap" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/benim"));
    expect(JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string)).toEqual({ passphrase: "kaptan2026" });
  });

  it("says a wrong password plainly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const u = user();
    render(<SoloLoginForm next={null} />);
    await u.type(screen.getByLabelText("Parola"), "yanlis");
    await u.click(screen.getByRole("button", { name: "Giriş yap" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Parola doğrulanamadı.");
    await u.clear(screen.getByLabelText("Parola"));
    await u.type(screen.getByLabelText("Parola"), "x".repeat(201));
    await u.click(screen.getByRole("button", { name: "Giriş yap" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Parola çok uzun.");
  });
});

describe("frame", () => {
  it("links to the full panel and signs out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    const u = user();
    render(
      <SoloShell user={{ uid: "uye-2", name: "Kişi", role: "risk_officer" }}>
        <p>içerik</p>
      </SoloShell>,
    );
    const account = screen.getByRole("navigation", { name: "Hesap" });
    expect(within(account).getByRole("link", { name: "Gelişmiş görünüm" })).toHaveAttribute("href", "/bugun");
    await u.click(within(account).getByRole("button", { name: "Çıkış" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
  });
});
