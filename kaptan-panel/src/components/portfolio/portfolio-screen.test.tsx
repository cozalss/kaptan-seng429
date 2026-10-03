import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { PortfolioScreen } from "./portfolio-screen";
import { S3Harness, S3_USERS, stubLayoutWidth } from "./test-harness";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/portfolio",
}));

let db: MockDb;
let restoreLayout: () => void;
beforeEach(() => {
  db = new MockDb(null);
  __setMockDb(db);
  replace.mockReset();
  restoreLayout = stubLayoutWidth();
});
afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  restoreLayout();
  vi.useRealTimers();
});

const renderAs = (who: keyof typeof S3_USERS, tab: "pozisyonlar" | "emirler" | "fis" = "pozisyonlar") =>
  render(
    <S3Harness user={S3_USERS[who]} db={db}>
      <PortfolioScreen initialTab={tab} />
    </S3Harness>,
  );

async function confirmDialog(user: ReturnType<typeof userEvent.setup>, opts: { comment: string; phrase: string; totp?: string }) {
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByRole("textbox", { name: /gerekçe/i }), opts.comment);
  if (opts.totp) await user.type(within(dialog).getByLabelText(/Doğrulama kodu/), opts.totp);
  await user.type(within(dialog).getByLabelText(/Onaylamak için/), opts.phrase);
  const submit = within(dialog).getAllByRole("button").find((b) => b.getAttribute("type") === "submit") as HTMLElement;
  await user.click(submit);
}


describe("PortfolioScreen", () => {
  it("shows the risk state, the curves, positions and the risk rules", async () => {
    renderAs("analyst");
    expect(await screen.findByRole("heading", { name: "Risk durumu" })).toBeInTheDocument();
    expect(screen.getByTestId("kill-state")).toHaveTextContent("KAPALI");
    expect(screen.getByRole("meter", { name: /Zirveden düşüş/ })).toBeInTheDocument();
    // Charts are lazy chunks (Recharts): they arrive just after the screen.
    expect(await screen.findByText("Kümülatif getiri: KAPtan vs karşılaştırmalar")).toBeInTheDocument();
    expect(await screen.findByText("Düşüş ve günlük K/Z")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Açık pozisyonlar" });
    expect(within(table).getAllByText("KRGSG").length).toBeGreaterThan(0);
    expect(within(table).getByText("bugün çıkış")).toBeInTheDocument();
    expect(screen.getByText("Bu ekranda geçerli kurallar")).toBeInTheDocument();
  });

  it("keeps the kill switch visible but disabled for the Analyst, with the reason", async () => {
    renderAs("analyst");
    const btn = await screen.findByRole("button", { name: "Kill switch'i aç" });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/yalnızca Risk Officer veya Admin açabilir/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zarar simülasyonu" })).toBeDisabled();
  });

  it("engages the kill switch with DURDUR, then runs the four-eyes reset (Admin 1/2 → Risk Officer 2/2)", async () => {
    const user = userEvent.setup({ delay: null });
    const first = renderAs("admin");
    await user.click(await screen.findByRole("button", { name: "Kill switch'i aç" }));
    await confirmDialog(user, { comment: "Test: piyasa anomalisi", phrase: "durdur" });
    await waitFor(() => expect(screen.getByTestId("kill-state")).toHaveTextContent("AÇIK"));
    await waitFor(() => expect(screen.getAllByText("çıkış kuralıyla yönetiliyor").length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: "Sıfırlamayı başlat" }));
    await confirmDialog(user, { comment: "Zarar incelendi, sıfırlanabilir", phrase: "SIFIRLA", totp: "000000" });
    expect(await screen.findByTestId("reset-pending")).toHaveTextContent("Risk Officer onayı gerekiyor (1/2)");
    expect(screen.getByRole("button", { name: "Sıfırlamayı onayla" })).toBeDisabled();
    first.unmount();

    renderAs("risk");
    await user.click(await screen.findByRole("button", { name: "Sıfırlamayı onayla" }));
    await confirmDialog(user, { comment: "İkinci göz: onaylıyorum", phrase: "ONAYLA", totp: "123456" });
    await waitFor(() => expect(screen.getByTestId("kill-state")).toHaveTextContent("KAPALI"));
    expect(screen.getByText(/Son sıfırlama: 2\/2 onaylandı/)).toBeInTheDocument();
    expect(await screen.findByText("Sıfırlama onaylandı (2/2)")).toBeInTheDocument();
  });

  it("plays the loss simulation: daily stop at −1 %, then the kill switch at −5,21 %", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    renderAs("admin");
    await user.click(await screen.findByRole("button", { name: "Zarar simülasyonu" }));
    await act(async () => {
      vi.advanceTimersByTime(4_300);
    });
    await waitFor(() => expect(screen.getByText("Yeni emir durdu")).toBeInTheDocument());
    await act(async () => {
      vi.advanceTimersByTime(4_500);
    });
    await waitFor(() => expect(screen.getByTestId("kill-state")).toHaveTextContent("AÇIK"));
    expect(screen.getByTestId("drawdown-value")).toHaveTextContent("5,21");
    expect(screen.getByText("Zirveden −%5 düşüş (R01)")).toBeInTheDocument();
  });

  it("switches tabs (URL kept) and shows orders and the personal-mode ticket", async () => {
    const user = userEvent.setup({ delay: null });
    renderAs("risk");
    await user.click(await screen.findByRole("tab", { name: /Emirler ve dolumlar/ }));
    expect(replace).toHaveBeenCalledWith("/portfolio?sekme=emirler", { scroll: false });
    expect(await screen.findByRole("table", { name: "Emirler ve dolumlar" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Emir fişleri/ }));
    expect(await screen.findByText(/T-2027-0111-003/)).toBeInTheDocument();
    expect(screen.getByText(/LİMİT 48,40 TL · 620 lot/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Açık pozisyonlar/ }));
    expect(replace).toHaveBeenLastCalledWith("/portfolio", { scroll: false });
  });

  it("opens the table twin of a chart and the common-period range", async () => {
    const user = userEvent.setup({ delay: null });
    renderAs("auditor", "fis");
    await screen.findByRole("heading", { name: "Risk durumu" });
    await user.click(await screen.findByRole("button", { name: "Ortak dönem" }));
    expect(screen.getByText("Ortak dönem: hepsi 23 Kas'ta sıfırlandı")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Tablo" })).toHaveLength(2));
    const tableButtons = screen.getAllByRole("button", { name: "Tablo" });
    await user.click(tableButtons[0] as HTMLElement);
    await user.click(tableButtons[1] as HTMLElement);
    expect(screen.getByRole("table", { name: /Kümülatif getiri.*tablo/ })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Düşüş ve günlük K\/Z — tablo/ })).toBeInTheDocument();
  });
});
