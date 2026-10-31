import { render, screen, within } from "@testing-library/react";
import type { DayCounters, LimitValue, RiskStatus } from "@/lib/domain";
import { FlowStrip } from "./flow-strip";
import { dailyTry } from "./kpi-row";
import { limitUsage, LimitsUsage } from "./limits-usage";

const risk = {
  kill_switch: "off",
  kill_reason: null,
  kill_at: null,
  kill_by: null,
  halted_today: false,
  daily_pnl_pct: -0.005,
  drawdown_pct: -0.04,
  peak_equity: 1_050_000,
  equity: 1_008_000,
  regime: "normal",
  live_armed: false,
  quota: [],
  reset: null,
  as_of: "2027-01-11T10:40:00.000Z",
} as RiskStatus;

const values: LimitValue[] = [
  { key: "risk_per_trade_pct", value: 0.005 },
  { key: "max_concurrent_positions", value: 10 },
  { key: "daily_loss_halt_pct", value: -0.01 },
  { key: "kill_drawdown_pct", value: -0.05 },
];

describe("Bugün dashboard pieces", () => {
  it("measures each stop line: half the daily pause, 80% of the −5% stop, 7 of 10 positions", () => {
    const rows = limitUsage(risk, values, 7);
    expect(rows.map((r) => [r.key, Math.round(r.used * 100)])).toEqual([
      ["daily", 50],
      ["drawdown", 80],
      ["positions", 70],
    ]);
  });

  it("counts a gain as no use of the loss limit and leaves out what it cannot measure", () => {
    const rows = limitUsage({ ...risk, daily_pnl_pct: 0.003, drawdown_pct: 0 }, values, null);
    expect(rows.map((r) => r.key)).toEqual(["daily", "drawdown"]);
    expect(rows.every((r) => r.used === 0)).toBe(true);
    expect(rows[0]?.now).toContain("kârda");
    expect(rows[1]?.now).toBe("zirvede");
  });

  it("turns the day's return into TL from today's value", () => {
    expect(Math.round(dailyTry(1_010_000, 0.01))).toBe(10_000);
    expect(dailyTry(1_000_000, 0)).toBe(0);
  });

  it("shows the meters and the per-trade amount", () => {
    render(<LimitsUsage risk={risk} values={values} openPositions={7} />);
    const meters = screen.getAllByRole("meter");
    expect(meters.map((m) => m.getAttribute("aria-valuenow"))).toEqual(["50", "80", "70"]);
    expect(screen.getByText("İşlem başına risk").parentElement).toHaveTextContent(/bugün 5\.040\sTL/);
  });

  it("writes every segment of the disclosure flow next to its colour", () => {
    const counters: DayCounters = {
      as_of: risk.as_of,
      total: 212,
      noise: 61,
      archived: 138,
      processed: 13,
      e_candidates: 12,
      proposals: 6,
      approvals: 1,
      rejections: 1,
      llm_calls: 40,
      llm_tokens: 9000,
    };
    render(<FlowStrip data={counters} />);
    const card = screen.getByRole("region", { name: "Bildirim akışı" });
    expect(card).toHaveTextContent("212bildirim okundu");
    expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["61gürültü, elendi", "138ilgisiz, arşivlendi", "13tayfaya gönderildi", "12olay adayı", "6öneri", "1 · 1onay · ret"]);
  });
});
