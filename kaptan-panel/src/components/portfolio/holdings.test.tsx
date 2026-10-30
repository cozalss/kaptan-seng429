import { render, screen, within } from "@testing-library/react";
import type { Position } from "@/lib/domain";
import { Holdings } from "./holdings";

const base: Position = {
  ticker: "ORNEK",
  company_name: "ÖRNEK ENERJİ A.Ş.",
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

describe("Holdings", () => {
  it("tells the KAPtan account's fill from the slip you entered yourself, for the same company", () => {
    render(<Holdings positions={[base, { ...base, qty: 620, avg_cost: 48.4, unrealized_pnl: -620, book: "personal" }]} today="2027-01-11" />);
    const rows = within(screen.getByRole("table", { name: "Elindekiler" })).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("KAPtan hesabı");
    expect(rows[0]).not.toHaveTextContent("Kendi hesabın");
    expect(rows[1]).toHaveTextContent("Kendi hesabın");
    expect(rows[1]).not.toHaveTextContent("KAPtan hesabı");
  });
});
