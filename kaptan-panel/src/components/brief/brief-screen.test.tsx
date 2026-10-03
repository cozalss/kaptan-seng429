import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { engageKillSwitch, stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { S3Harness, S3_USERS } from "../portfolio/test-harness";
import { BriefScreen } from "./brief-screen";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/brief",
}));

let db: MockDb;
beforeEach(() => {
  db = new MockDb(null);
  __setMockDb(db);
  replace.mockReset();
});
afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
});

const renderAs = (who: keyof typeof S3_USERS, date: string | null = null) =>
  render(
    <S3Harness user={S3_USERS[who]} db={db}>
      <BriefScreen date={date} />
    </S3Harness>,
  );


describe("BriefScreen", () => {
  it("prints the six sections of the 08:45 brief, with the LLM label", async () => {
    renderAs("auditor");
    expect(await screen.findByRole("heading", { level: 1, name: "Sabah özeti" })).toBeInTheDocument();
    for (const h of ["Dünden bu yana önemli bildirimler", "Açılışta girilecek onaylı emirler", "Onay bekleyenler", "Açık pozisyonlar · bugün çıkış", "Risk uyarıları", "Tedbir değişiklikleri"]) {
      expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    }
    expect(screen.getByText(/08:45 itibarıyla/)).toBeInTheDocument();
    expect(screen.getByText("LLM üretimi, doğrulanmamış")).toBeInTheDocument();
    // Orders for the open: one partial fill and one that lapsed at the limit-up open.
    expect(screen.getByText(/Kısmi dolum 820\/1\.400/)).toBeInTheDocument();
    expect(screen.getByText("Tavanda açıldı, dolmadı")).toBeInTheDocument();
    const positions = screen.getByRole("table", { name: /Açık pozisyonlar/ });
    expect(within(positions).getByText("bugün")).toBeInTheDocument();
    expect(screen.getByText("VBTS brüt takas")).toBeInTheDocument();
  });

  it("shows the live desk state and puts a critical warning first when the kill switch is on", async () => {
    await act(async () => engageKillSwitch(db, "user:u-risk", "Test"));
    renderAs("analyst");
    expect(await screen.findByText(/KILL SWITCH AÇIK — yeni emir yok/)).toBeInTheDocument();
    const warnings = screen.getByRole("heading", { name: "Risk uyarıları" }).closest("section") as HTMLElement;
    expect(within(warnings).getAllByRole("listitem")[0]).toHaveTextContent("Kritik");
  });

  it("changes the session through the URL and prints", async () => {
    const user = userEvent.setup({ delay: null });
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    renderAs("risk");
    await screen.findByRole("heading", { level: 1, name: "Sabah özeti" });
    await user.selectOptions(screen.getByLabelText("Seans"), "2027-01-08");
    expect(replace).toHaveBeenCalledWith("/brief?tarih=2027-01-08", { scroll: false });
    await user.click(screen.getByRole("button", { name: "Yazdır" }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it("renders a past session without the live line", async () => {
    renderAs("risk", "2027-01-08");
    expect(await screen.findByText("8 Ocak 2027 Cuma", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText(/Şu an \(canlı/)).toBeNull();
  });
});
