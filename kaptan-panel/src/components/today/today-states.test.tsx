import { render, screen } from "@testing-library/react";
import type { DeskState } from "@/components/shell/desk-state";
import type { RiskStatus } from "@/lib/domain";
import { TodayScreen } from "./today-screen";

const risk = {
  kill_switch: "off",
  kill_reason: null,
  kill_at: null,
  kill_by: null,
  halted_today: false,
  daily_pnl_pct: 0.002,
  drawdown_pct: -0.01,
  peak_equity: 1_030_000,
  equity: 1_018_615,
  regime: "normal",
  live_armed: false,
  quota: [],
  reset: null,
  as_of: "2027-01-11T10:40:00.000Z",
} as RiskStatus;

let desk: DeskState;
const base = (over: Partial<DeskState>): DeskState => ({
  counters: null,
  risk,
  pending: [],
  feedStatus: "closed",
  deskStatus: "closed",
  error: null,
  refresh: async () => undefined,
  epoch: 0,
  resetView: () => undefined,
  ...over,
});

vi.mock("@/components/shell/desk-state", () => ({ useDesk: () => desk }));
vi.mock("@/lib/sse/use-event-stream", () => ({ useEventStream: () => "closed" }));
vi.mock("@/lib/clock", () => ({ useNow: () => Date.parse("2027-01-11T10:40:00.000Z") }));
vi.mock("@/components/roles/use-role", () => ({ useRole: () => ({ role: "analyst" }) }));
vi.mock("./waiting-list", () => ({ WaitingList: () => null }));

describe("Bugün's quiet days", () => {
  it("shows the calm day with no deadline when nothing waits", () => {
    desk = base({});
    render(<TodayScreen />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bugün öneri yok — tayfa izliyor.");
    expect(screen.getByText("Bekleyen karar yok.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Bekleyen öneri yok" })).toHaveTextContent("sayfayı yenilemen gerekmez");
    expect(screen.getByRole("list", { name: "Tayfa: sekiz üye" }).children).toHaveLength(8);
    expect(screen.getByRole("link", { name: /^Portföyün: / })).toHaveAttribute("href", "/portfoy");
  });

  it("says what Durdur did and where the two-person restart lives", () => {
    desk = base({ risk: { ...risk, kill_switch: "on", kill_reason: "oynaklık", kill_at: "2027-01-11T10:00:00.000Z", kill_by: "user:uye-3" } });
    render(<TodayScreen />);
    const stop = screen.getByRole("region", { name: "Durdurma" });
    expect(stop).toHaveTextContent("Masa elle durduruldu (13:00). Gerekçe: “oynaklık”");
    expect(screen.getByRole("link", { name: /Yeniden başlatma Portföy’de/ })).toHaveAttribute("href", "/portfoy");
    expect(screen.getByText("Karar yok.")).toBeInTheDocument();
  });

  it("names the system when the −5% rule stopped the desk", () => {
    desk = base({ risk: { ...risk, kill_switch: "on", kill_at: null, kill_by: "system:risk_monitor" } });
    render(<TodayScreen />);
    expect(screen.getByRole("region", { name: "Durdurma" })).toHaveTextContent("Risk izleyici zirveden −%5’te kendiliğinden durdurdu.");
  });
});
