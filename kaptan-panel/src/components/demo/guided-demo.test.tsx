import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { SettingsScreen } from "../settings/settings-screen";
import { GuidedDemo } from "./guided-demo";
import { __resetDemoStore, demoStore, goToStep, startGuidedDemo } from "./demo-store";
import { DEMO_STEPS } from "./demo-steps";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

const user = () => userEvent.setup({ delay: null });

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
  __resetDemoStore();
  nav.pathname = "/bugun";
  nav.push.mockReset();
});

describe("rehberli tur", () => {
  it("starts from Ayarlar, switches roles, opens the screen and walks with the keys", async () => {
    const u = user();
    renderWithDesk(
      <>
        <SettingsScreen />
        <GuidedDemo />
      </>,
      new MockDb(null),
      "risk_officer",
    );
    await u.click(await screen.findByRole("button", { name: "Turu başlat" }));
    const bar = await screen.findByTestId("guided-demo");
    expect(within(bar).getByTestId("demo-step-title")).toHaveTextContent(DEMO_STEPS[0]!.title);
    expect(bar).toHaveTextContent("Perde 1/6");
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/bugun"));
    await waitFor(() => expect(bar).toHaveTextContent("Rol: Analist"));

    await u.keyboard("{ArrowRight}");
    expect(within(bar).getByTestId("demo-step-title")).toHaveTextContent(DEMO_STEPS[1]!.title);
    await waitFor(() => expect(bar).toHaveTextContent("Rol: Yönetici"));
    await u.keyboard("{ArrowLeft}");
    expect(demoStore.get().index).toBe(0);
    await u.click(within(bar).getByRole("button", { name: "Sonraki adım" }));
    expect(demoStore.get().index).toBe(1);
    await u.click(within(bar).getByRole("button", { name: "Rehberli turu kapat" }));
    expect(screen.queryByTestId("guided-demo")).toBeNull();
  });

  it("offers a backup for a manual step and finishes on the last one", async () => {
    const u = user();
    const db = new MockDb(null);
    db.update((st) => ({
      ...st,
      limitVersions: [
        ...st.limitVersions,
        { ...st.limitVersions[0]!, version: 2, status: "proposed", values: st.limitVersions[0]!.values.map((v) => (v.key === "risk_per_trade_pct" ? { ...v, value: 0.004 } : v)), proposed_by: { uid: "uye-1", name: "Üye 1", role: "admin", at: db.nowIso(), reason: "deneme" }, decided_by: null },
      ],
    }));
    startGuidedDemo();
    act(() => goToStep(DEMO_STEPS.findIndex((st) => st.id === "4g")));
    nav.pathname = "/ayarlar";
    renderWithDesk(<GuidedDemo />, db, "risk_officer");
    const bar = await screen.findByTestId("guided-demo");
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/ayarlar"));
    const backup = within(bar).getByRole("button", { name: "Yedek: onayla (2/2)" });
    await waitFor(() => expect(backup).toBeEnabled());
    await u.click(backup);
    await waitFor(() => expect(db.snapshot.limitVersions.find((v) => v.version === 2)?.status).toBe("active"));

    act(() => goToStep(DEMO_STEPS.length - 1));
    await u.click(await within(bar).findByRole("button", { name: "Turu bitir" }));
    expect(demoStore.get().active).toBe(false);
  });
});
