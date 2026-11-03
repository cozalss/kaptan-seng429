import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeskStateProvider } from "@/components/shell/desk-state";
import userEvent from "@testing-library/user-event";
import { ApiProvider } from "@/lib/api/react";
import { SessionProvider } from "@/lib/auth/session-context";
import { ApiError, type KaptanApi } from "@/lib/api/types";
import { NBSP } from "@/lib/format";
import type { Position } from "@/lib/domain";
import type { Allocation, Overview, Suggestion } from "@/lib/solo/overview";
import { nav } from "../nav.test-utils";
import { Activity } from "./activity";
import { AllocationPanel, allocationRows, foldSmall } from "./allocation";
import { isFlat, MoneyHero } from "./money-hero";
import { SoloHome } from "./solo-home";
import { afterLogin, SoloLoginForm, SoloLoginScreen } from "./solo-login";
import { SoloShell } from "./solo-shell";
import { orderSuggestions, Suggestions } from "./suggestions";
import { EMPTY_DECIDE } from "@/components/proposal/decide-logic";
import type { Decisions } from "@/components/proposal/use-decisions";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });
const plain = (t: string | null | undefined) => (t ?? "").replaceAll(NBSP, " ");

const alloc = (symbol: string, amount: number, pnl = 0.01): Allocation => ({ symbol, name: `${symbol} A.Ş.`, amount, weight: amount / 1_000_000, pnl_pct: pnl });

afterEach(() => {
  vi.unstubAllGlobals();
  nav.replace.mockClear();
});

describe("Param nerede?", () => {
  it("gives six holdings their own ink and folds the rest into one Diğer part", () => {
    const many = ["A", "B", "C", "D", "E", "F", "G"].map((s, i) => alloc(s, 70_000 - i * 1_000));
    const { bar, list } = allocationRows(many, 500_000, 1_000_000);
    expect(bar.map((r) => r.label)).toEqual(["A", "B", "C", "D", "E", "Diğer (2)", "Nakit"]);
    // The list folds the same way: no two named rows share an ink; Diğer names what it holds.
    expect(list.map((r) => r.label)).toEqual(bar.map((r) => r.label));
    expect(list.find((r) => r.fill === "other")?.detail).toBe("F, G");
    const six = allocationRows(many.slice(0, 6), 0, 1_000_000);
    expect(six.bar.filter((r) => r.fill === "slot")).toHaveLength(6);
    expect(allocationRows([], 10, 0).list[0]?.share).toBe(0);
  });

  it("folds holdings too small to label, whatever the box, and keeps the rest", () => {
    const rows = allocationRows([alloc("A", 500_000), alloc("B", 1_000), alloc("C", 1_000)], 498_000, 1_000_000).bar;
    expect(foldSmall(rows, 10_000 * 10_000).map((r) => r.label)).toEqual(["A", "B", "C", "Nakit"]);
    const folded = foldSmall(rows, 600 * 400);
    expect(folded.map((r) => r.label)).toEqual(["A", "Diğer (2)", "Nakit"]);
    expect(folded.find((r) => r.fill === "other")).toMatchObject({ detail: "B, C", amount: 2_000 });
  });

  it("names every tile with amount, share and gain, links it to Param; says so when everything is cash", () => {
    const { rerender } = render(<AllocationPanel allocations={[alloc("FRZEN", 50_000, 0.05)]} cash={950_000} total={1_000_000} />);
    const tile = screen.getByRole("link", { name: /^FRZEN/ });
    expect(plain(tile.getAttribute("aria-label"))).toContain("50.000 ₺, paranın %5'i. Alıştan beri +%5.");
    expect(tile).toHaveAttribute("href", "/portfoy");
    expect(plain(screen.getByRole("link", { name: /^Nakit/ }).textContent)).toContain("950.000 ₺");
    expect(screen.getByText(/Paran 2 yerde duruyor/)).toBeInTheDocument();
    rerender(<AllocationPanel allocations={[]} cash={1_000_000} total={1_000_000} />);
    expect(screen.getByText("Henüz hisse yok; paranın tamamı nakitte.")).toBeInTheDocument();
  });
});

describe("the money hero", () => {
  const series = Array.from({ length: 120 }, (_, i) => ({
    date: new Date(Date.parse("2026-09-14T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10),
    equity: 1_000_000 + i * 500,
  }));
  const overview = (over: Partial<Overview> = {}): Overview => ({
    capital_start: 1_000_000,
    equity_now: 1_059_500,
    cash: 900_000,
    pnl_abs: 59_500,
    pnl_pct: 0.0595,
    equity_series: series,
    allocations: [alloc("FRZEN", 159_500)],
    open_suggestions: [],
    ...over,
  });

  const hero = (o: Overview, todayPct: number | null, positions: readonly Position[] = []) => <MoneyHero overview={o} todayPct={todayPct} positions={positions} name="Deniz" />;

  it("opens with today's sentence and the total, and the plain facts with their meaning", () => {
    render(hero(overview(), 0.002));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Paran bugün .*2\.115.*arttı\./);
    expect(plain(screen.getByTestId("toplam-para").textContent)).toBe("1.059.500,00₺");
    expect(screen.getByText("Yatırımda")).toBeInTheDocument();
    expect(screen.getByText("Şu an hisse senetlerinde duran para.")).toBeInTheDocument();
  });

  it("the boat sails to a scrubbed day: keyboard and pointer, and the reading says it in words", async () => {
    const u = user();
    render(hero(overview(), 0.002, [{ ticker: "FRZEN", qty: 10, avg_cost: 100, opened_at: `${series[100]?.date}T07:00:00Z` } as Position]));
    const readout = screen.getByTestId("grafik-okuma");
    expect(plain(readout.textContent)).toContain("Bugün: 1.059.500 ₺");
    await u.click(screen.getByRole("button", { name: "Son 1 ay" }));
    expect(screen.getByRole("button", { name: "Son 1 ay" })).toHaveAttribute("aria-pressed", "true");
    const slider = screen.getByRole("slider", { name: "Paranın gün gün değeri" });
    slider.focus();
    await u.keyboard("{Home}");
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    expect(plain(slider.getAttribute("aria-valuetext"))).toMatch(/: [\d.]+ ₺\. Başladığın yerden [\d.]+ ₺ yukarıda\./);
    await u.keyboard("{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    await u.keyboard("x");
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    // The total stays today's: a scrub reads a day, it does not change what you have.
    expect(plain(screen.getByTestId("toplam-para").textContent)).toBe("1.059.500,00₺");
    slider.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 100, right: 300, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(slider, { clientX: 0 });
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    fireEvent.pointerLeave(slider);
    expect(plain(readout.textContent)).toContain("Bugün");
    await u.click(screen.getByText("Tablo olarak göster"));
    expect(screen.getAllByRole("row").length).toBeGreaterThan(20);
  });

  it("a day money moved says so on the slider and in the table", async () => {
    const u = user();
    const buy = { ticker: "FRZEN", qty: 10, avg_cost: 100, opened_at: `${series[119]?.date}T07:00:00Z` } as Position;
    render(hero(overview(), 0.002, [buy]));
    const slider = screen.getByRole("slider", { name: "Paranın gün gün değeri" });
    slider.focus();
    await u.keyboard("{End}");
    expect(plain(slider.getAttribute("aria-valuetext"))).toContain("FRZEN aldın · 1.000 ₺.");
    await u.click(screen.getByText("Tablo olarak göster"));
    expect(plain(screen.getByRole("table").textContent)).toContain("FRZEN aldın · 1.000 ₺");
  });

  it("closes a period that would show the same as everything, without striking it out", () => {
    render(hero(overview({ equity_series: series.slice(0, 20) }), null));
    const three = screen.getByRole("button", { name: /Son 3 ay: henüz/ });
    expect(three).toBeDisabled();
    expect(three.className).not.toContain("line-through");
  });

  it("says so when there is not enough history, and when nothing has moved yet", () => {
    render(hero(overview({ equity_series: [{ date: "2027-01-11", equity: 1_000_000 }], allocations: [], pnl_abs: 0, pnl_pct: 0 }), 0));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Paran hazır, KAPtan okuyor.");
    expect(screen.getByText("Grafik, ikinci günden sonra burada başlar.")).toBeInTheDocument();
    expect(screen.getByText("Henüz değişim yok")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("says a flat day and a down day in words", () => {
    const { rerender } = render(hero(overview(), 0));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Paran bugün yerinde duruyor.");
    rerender(hero(overview(), -0.01));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/azaldı\./);
  });

  it("knows a flat line", () => {
    expect(isFlat([{ date: "2027-01-10", equity: 1 }, { date: "2027-01-11", equity: 1 }, { date: "2027-01-12", equity: 1 }])).toBe(true);
    expect(isFlat(series)).toBe(false);
  });
});

describe("Öneriler and Son işlemler", () => {
  const s = (id: string, action: Suggestion["action"], confidence: number): Suggestion => ({ id, symbol: id.toUpperCase(), action, reason_short: "Bir sebep.", confidence, expires_at: null });

  it("orders buys, sells, holds and the strongest first", () => {
    expect(orderSuggestions([s("t", "tut", 0.9), s("s", "sat", 0.5), s("a", "al", 0.5), s("b", "al", 0.8)]).map((x) => x.id)).toEqual(["b", "a", "s", "t"]);
  });

  const decisions = (over: Partial<Decisions> = {}): Decisions => ({
    state: EMPTY_DECIDE,
    steps: [],
    ticketOf: () => null,
    ticketsError: null,
    retryTickets: vi.fn(),
    onMarked: vi.fn(),
    onAnswer: vi.fn(),
    onPick: vi.fn(),
    announcement: "",
    ...over,
  });

  it("makes an empty day a good one, with today's reading to show for it", () => {
    render(<Suggestions suggestions={[]} names={new Map()} stopped={false} today={{ read: 796, toCrew: 40 }} decisions={decisions()} />);
    expect(screen.getByRole("heading", { name: "Bugün karar vermen gereken bir şey yok." })).toBeInTheDocument();
    expect(plain(screen.getByRole("region", { name: "Öneriler" }).textContent)).toContain("KAPtan bugün 796 bildirim okudu, 40 tanesine yakından baktı. Şu an senden bir şey beklemiyor.");
  });

  it("says something true when today's reading could not be read, or everything is stopped", () => {
    const { rerender } = render(<Suggestions suggestions={[]} names={new Map()} stopped={false} today={null} decisions={decisions()} />);
    expect(screen.getByText("KAPtan izliyor. Senden şu an bir şey beklemiyor.")).toBeInTheDocument();
    rerender(<Suggestions suggestions={[]} names={new Map()} stopped today={null} decisions={decisions()} />);
    expect(screen.getByRole("heading", { name: "İşlemler durdu; şimdilik karar yok." })).toBeInTheDocument();
  });

  it("shows an answer's own error, how sure KAPtan is, and closes Onayla on a halted day", () => {
    const failed = { ...EMPTY_DECIDE, errors: { x: "Sunucu cevap vermedi." } };
    const { rerender } = render(<Suggestions suggestions={[s("x", "al", 0.3)]} names={new Map()} stopped={false} decisions={decisions({ state: failed })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Olmadı. Sunucu cevap vermedi.");
    expect(screen.getByText("KAPtan pek emin değil.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onayla: AL X" })).toBeEnabled();
    rerender(<Suggestions suggestions={[s("x", "al", 0.3)]} names={new Map()} stopped={false} halted decisions={decisions()} />);
    expect(screen.getByRole("button", { name: "Onayla: AL X" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Geç: AL X" })).toBeEnabled();
    expect(screen.getByText(/Yarın kendiliğinden açılır/)).toBeInTheDocument();
  });

  it("the keyboard can reach every waiting suggestion", async () => {
    const u = user();
    const onPick = vi.fn();
    render(<Suggestions suggestions={[s("a", "al", 0.8), s("b", "al", 0.5)]} names={new Map()} stopped={false} decisions={decisions({ onPick })} />);
    screen.getByRole("button", { name: "Öne al: AL B" }).focus();
    await u.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith("b");
  });

  it("a swipe on a touch screen shows the next one and never answers", () => {
    const onPick = vi.fn();
    const onAnswer = vi.fn();
    render(<Suggestions suggestions={[s("a", "al", 0.8), s("b", "al", 0.5)]} names={new Map()} stopped={false} decisions={decisions({ onPick, onAnswer })} />);
    const stack = screen.getByRole("article").parentElement as HTMLElement;
    fireEvent.pointerDown(stack, { pointerType: "touch", isPrimary: true, pointerId: 1, clientX: 300, clientY: 100 });
    fireEvent.pointerUp(stack, { pointerType: "touch", pointerId: 1, clientX: 180, clientY: 104 });
    expect(onPick).toHaveBeenCalledWith("b");
    expect(onAnswer).not.toHaveBeenCalled();
    // A mouse drag or a small move does nothing.
    onPick.mockClear();
    fireEvent.pointerDown(stack, { pointerType: "mouse", isPrimary: true, pointerId: 2, clientX: 300, clientY: 100 });
    fireEvent.pointerUp(stack, { pointerType: "mouse", pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(stack, { pointerType: "touch", isPrimary: true, pointerId: 3, clientX: 300, clientY: 100 });
    fireEvent.pointerUp(stack, { pointerType: "touch", pointerId: 3, clientX: 280, clientY: 100 });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("has an empty Son işlemler", () => {
    render(<Activity items={[]} />);
    expect(screen.getByText(/Henüz işlem yok/)).toBeInTheDocument();
  });

  it("writes Son işlemler as a log: rows with a proposal open it, a day is written once", () => {
    const row = (key: string, at: string, proposalId: string | null) => ({ key, at, kind: "bought" as const, text: key, title: key, amount: 3_000, proposalId });
    render(<Activity items={[row("A aldın", "2027-01-11T07:00:00Z", "p-1"), row("B kalıyor", "2027-01-11T06:00:00Z", null), row("C aldın", "2027-01-04T06:00:00Z", "p/2")]} />);
    expect(screen.getByRole("link", { name: /A aldın/ })).toHaveAttribute("href", "/oneri/p-1");
    expect(screen.getByRole("link", { name: /C aldın/ })).toHaveAttribute("href", "/oneri/p%2F2");
    expect(screen.queryByRole("link", { name: /B kalıyor/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Geçmişin tamamı/ })).toHaveAttribute("href", "/gecmis");
  });
});

describe("loading and errors", () => {
  it("shows a plain error and a retry when the home cannot be read", async () => {
    const failing = {
      overview: () => Promise.reject(new ApiError(503, "down", "Servis şu an kapalı.")),
      riskStatus: () => new Promise(() => {}),
      listApprovals: () => new Promise(() => {}),
      positions: () => new Promise(() => {}),
      counters: () => new Promise(() => {}),
    } as unknown as KaptanApi;
    render(
      <SessionProvider user={{ uid: "sen", name: "Kişi" }}>
        <ApiProvider api={failing}>
          <DeskStateProvider>
            <SoloHome />
          </DeskStateProvider>
        </ApiProvider>
      </SessionProvider>,
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

  it("has one password field, shows no password anywhere, and signs in", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ redirect: "/bugun" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const u = user();
    render(<SoloLoginScreen next={null} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sen karar ver, KAPtan okusun.");
    expect(screen.getByText(/şirketlerin her gün yaptığı duyuruları/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Giriş yap" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Parola gerekli.");
    expect(screen.queryByRole("button", { name: "Doldur" })).toBeNull();
    expect(document.body).not.toHaveTextContent("kaptan2026");
    await u.type(screen.getByLabelText("Parola"), "kaptan2026");
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
  it("signs out from the account menu", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    const u = user();
    render(
      <SoloShell user={{ uid: "sen", name: "Kişi" }}>
        <p>içerik</p>
      </SoloShell>,
    );
    await u.click(screen.getByRole("button", { name: "Hesabım" }));
    await u.click(await screen.findByRole("menuitem", { name: "Çıkış" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
  });
});
