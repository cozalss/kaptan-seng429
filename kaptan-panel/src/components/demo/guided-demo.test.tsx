import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderAs } from "@/components/admin/harness.test.utils";
import { demoStore, goToStep, setAutoplay, startGuidedDemo, __resetDemoStore } from "./demo-store";
import { DEMO_STEPS } from "./demo-steps";
import { GuidedDemo } from "./guided-demo";

const push = vi.fn();
const refresh = vi.fn();
let pathname = "/admin";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh, prefetch: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  pathname = "/admin";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ redirect: "/inbox" }), { status: 200 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  __resetDemoStore();
});

describe("GuidedDemo", () => {
  it("renders nothing until started", () => {
    renderAs("admin", <GuidedDemo />);
    expect(screen.queryByRole("region", { name: "Rehberli demo şeridi" })).toBeNull();
  });

  it("switches to the step's role, navigates, and moves with the arrow keys", async () => {
    const user = userEvent.setup({ delay: null });
    act(() => startGuidedDemo());
    renderAs("admin", <GuidedDemo />);
    const rail = await screen.findByRole("region", { name: "Rehberli demo şeridi" });
    expect(rail).toHaveTextContent("Canlı akış ve sayaçlar");
    // Step 1 wants the Risk Officer: the mock session endpoint is asked to switch roles.
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/mock/session", expect.objectContaining({ method: "PUT" })));
    expect(refresh).toHaveBeenCalled();
    await user.keyboard("{ArrowRight}");
    expect(demoStore.get().index).toBe(1);
    await user.keyboard("{ArrowLeft}");
    expect(demoStore.get().index).toBe(0);
    await user.click(screen.getByRole("button", { name: /Sonraki adım/ }));
    expect(demoStore.get().index).toBe(1);
    await user.click(screen.getByRole("button", { name: /Kill switch ve audit/ }));
    expect(DEMO_STEPS[demoStore.get().index]!.id).toBe("4a");
    await user.click(screen.getByRole("button", { name: "Küçült" }));
    await user.click(await screen.findByRole("button", { name: /Rehberli demoyu aç/ }));
    await user.click(screen.getByRole("button", { name: "Otomatik oynat" }));
    expect(demoStore.get().autoplay).toBe(true);
    await user.click(screen.getByRole("button", { name: "Demoyu kapat" }));
    expect(demoStore.get().active).toBe(false);
  });

  it("runs a step for the current role: navigates and injects after arriving", async () => {
    act(() => {
      startGuidedDemo();
      goToStep(DEMO_STEPS.findIndex((s) => s.id === "3b"));
    });
    pathname = "/runs/run-demo-r04-tmslj";
    const { db } = renderAs("admin", <GuidedDemo />);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/runs/run-demo-r04-tmslj"));
    await waitFor(() => expect(db.snapshot.injections.some((i) => i.scenario === "restricted_r04")).toBe(true));
  });

  it("offers the backup approval on step 2f and ends on the last step", async () => {
    const user = userEvent.setup({ delay: null });
    act(() => {
      startGuidedDemo();
      goToStep(DEMO_STEPS.findIndex((s) => s.id === "2f"));
    });
    pathname = "/approvals";
    renderAs("risk_officer", <GuidedDemo />);
    expect(await screen.findByRole("button", { name: "Yedek: otomatik onayla" })).toBeInTheDocument();
    act(() => {
      setAutoplay(false);
      goToStep(DEMO_STEPS.length - 1);
    });
    await user.click(await screen.findByRole("button", { name: /Demoyu bitir/ }));
    expect(demoStore.get().active).toBe(false);
  });
});
