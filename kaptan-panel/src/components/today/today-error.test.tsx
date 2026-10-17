import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DeskState } from "@/components/shell/desk-state";
import { TodayScreen } from "./today-screen";

const refresh = vi.fn(async () => undefined);
const desk: DeskState = {
  counters: null,
  risk: null,
  pending: [],
  feedStatus: "closed",
  deskStatus: "closed",
  error: "Sunucuya ulaşılamadı.",
  refresh,
  epoch: 0,
  resetView: () => undefined,
};

vi.mock("@/components/shell/desk-state", () => ({ useDesk: () => desk }));
vi.mock("@/lib/sse/use-event-stream", () => ({ useEventStream: () => "closed" }));
vi.mock("@/lib/clock", () => ({ useNow: () => null }));
vi.mock("@/components/roles/use-role", () => ({ useRole: () => ({ role: "risk_officer" }) }));

describe("Bugün without the server", () => {
  it("says it plainly and offers a retry", async () => {
    render(<TodayScreen />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bugün’ün listesi gelmedi.");
    expect(screen.getByRole("alert")).toHaveTextContent("Panel sunucuya ulaşamadı; öneriler ve portföy yüklenemedi.");
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
