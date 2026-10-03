import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { S3Harness, S3_USERS, stubLayoutWidth } from "../portfolio/test-harness";
import { EvalScreen } from "./eval-screen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/eval",
}));

let db: MockDb;
let restoreLayout: () => void;
beforeEach(() => {
  db = new MockDb(null);
  __setMockDb(db);
  restoreLayout = stubLayoutWidth();
});
afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  restoreLayout();
});

const renderAs = (who: keyof typeof S3_USERS) =>
  render(
    <S3Harness user={S3_USERS[who]} db={db}>
      <EvalScreen />
    </S3Harness>,
  );


describe("EvalScreen", () => {
  it("labels every number as a sample and states the honest expectation", async () => {
    renderAs("auditor");
    expect(screen.getByTestId("sample-stamp")).toHaveTextContent("örnek değer · gerçek sonuç değil");
    expect(screen.getByText(/yılda 0 ile/)).toBeInTheDocument();
    expect(screen.getByText(/Sıfır veya negatif sonuç geçerli bir bulgudur/)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Sınıflandırma" })).toBeInTheDocument();
    expect((await screen.findAllByText("ÖRNEK · gerçek sonuç değil")).length).toBeGreaterThan(0);
  });

  it("renders the four layers, ablations, red-team and operations", async () => {
    renderAs("risk");
    for (const h of ["Sınıflandırma", "RAG ve geri getirme", "Holdout olay çalışması", "İleri dönük paper test", "Ablation ve baseline'lar", "Red-team", "Gecikme ve maliyet"]) {
      expect(await screen.findByRole("heading", { name: h })).toBeInTheDocument();
    }
    expect(screen.getByText("Ana kanıt · tek koşu")).toBeInTheDocument();
    const matrix = screen.getByRole("table", { name: /Karışıklık matrisi/ });
    expect(within(matrix).getAllByRole("row")).toHaveLength(7);
    const holdout = screen.getByRole("table", { name: "Holdout olay çalışması sonuçları" });
    expect(within(holdout).getAllByText("(ön kayıtlı birincil test)")).toHaveLength(4);
    expect(screen.getByText("araştırma iddiası")).toBeInTheDocument();
    expect(screen.getByText("Kötü niyetliden çıkan emir")).toBeInTheDocument();
    expect(screen.getByText("Token / karar")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Gölge sinyaller" })).toBeInTheDocument();
  });

  it("closes the cost panel to the Analyst with a no-permission state", async () => {
    renderAs("analyst");
    expect(await screen.findByText("Bu panel rolünüze kapalı")).toBeInTheDocument();
    expect(screen.queryByText("Token / karar")).toBeNull();
  });

  it("offers a table twin for the RAGAS trend", async () => {
    const user = userEvent.setup({ delay: null });
    renderAs("risk");
    await screen.findByRole("heading", { name: "RAG ve geri getirme" });
    const ragFigure = screen.getByText("RAGAS trendi").closest("figure") as HTMLElement;
    await user.click(within(ragFigure).getByRole("button", { name: "Tablo" }));
    expect(within(ragFigure).getByRole("table", { name: "RAGAS trendi — tablo" })).toBeInTheDocument();
  });
});
