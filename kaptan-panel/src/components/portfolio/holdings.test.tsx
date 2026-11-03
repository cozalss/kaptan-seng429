import { render, screen, within } from "@testing-library/react";
import type { Position } from "@/lib/domain";
import { Holdings } from "./holdings";

const base: Position = {
  ticker: "ORNEK",
  company_name: "MİSAL ENERJİ A.Ş.",
  qty: 1240,
  avg_cost: 48.32,
  last_price: 48.51,
  opened_at: "2027-01-11T10:40:00.000Z",
  planned_exit_date: "2027-01-18",
  holding_days: 0,
  source_proposal: "prop-demo-e3-ornek",
  run_id: "run-demo-e3-ornek",
  event_type: "E3",
  strategy_version: "v1.1-fwd",
  unrealized_pnl: 236,
  realized_pnl: 0,
  managed_by_exit_rule: false,
  book: "paper",
};

const holdingRows = () => within(screen.getByRole("list", { name: "Elindekiler" })).getAllByRole("listitem").filter((i) => i.id.startsWith("elinde-"));

describe("Holdings", () => {
  it("reads a holding as sentences: company first, what you paid, what it is worth, when it may be sold", () => {
    render(<Holdings positions={[base]} today="2027-01-11" />);
    const row = holdingRows()[0] as HTMLElement;
    expect(within(row).getByRole("heading", { level: 3, name: "Misal Enerji" })).toBeInTheDocument();
    expect(row).toHaveTextContent("ORNEK");
    expect(row).toHaveTextContent("1.240 adet aldın, 59.917 ₺ ödedin.");
    expect(row).toHaveTextContent("60.152 ₺");
    expect(row).toHaveTextContent("+236 ₺");
    expect(row).toHaveTextContent("KAPtan bunu 18 Ocak’ta satmayı önerecek.");
  });

  it("cuts the ledger at the water: what is down sits under the line", () => {
    render(<Holdings positions={[{ ...base, ticker: "DOWN", last_price: 40, unrealized_pnl: -10 }, base]} today="2027-01-11" />);
    const items = within(screen.getByRole("list", { name: "Elindekiler" })).getAllByRole("listitem");
    expect(items.map((i) => i.id || "su")).toEqual(["elinde-ORNEK", "su", "elinde-DOWN"]);
  });

  it("says what to do when nothing is held", () => {
    render(<Holdings positions={[]} today="2027-01-11" />);
    expect(screen.getByText("Henüz hisse almadın.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ana sayfaya dön" })).toHaveAttribute("href", "/benim");
  });

  it("names no account: there is one book, the person's own", () => {
    render(<Holdings positions={[base]} today="2027-01-11" />);
    expect(document.body).not.toHaveTextContent(/deneme|kendi bankanda/i);
  });
});
