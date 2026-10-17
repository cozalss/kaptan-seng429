import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __setMockDb, MockDb } from "@/lib/api/mock/db";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { renderWithDesk } from "../harness.test-utils";
import { nav } from "../nav.test-utils";
import { RolePicker } from "./role-picker";
import { __resetDemoStore } from "../demo/demo-store";
import { Toaster } from "../ui/toast";

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

describe("rol seçici", () => {
  it("lists four roles with a line each and switches", async () => {
    const u = user();
    renderWithDesk(
      <>
        <RolePicker />
        <Toaster />
      </>,
      new MockDb(null),
      "risk_officer",
    );
    await u.click(screen.getByRole("button", { name: /Rol: Risk Sorumlusu/ }));
    const items = await screen.findAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual([
      "Analist · Üye 2Okur, not ekler.",
      "Risk Sorumlusu · Üye 3Onaylar ya da reddeder; durdurur.",
      "Yönetici · Üye 1Kullanıcılar, ayarlar, senaryolar.",
      "Denetçi · DenetçiHer şeyi görür, hiçbir şeyi değiştiremez (jüri için).",
    ]);
    await u.click(items[3]!);
    expect(await screen.findByRole("button", { name: /Rol: Denetçi/ })).toBeInTheDocument();
    expect(await screen.findByText("Artık Denetçi gözüyle bakıyorsun.")).toBeInTheDocument();
    // Screen readers hear the switch from the picker itself, not only from the toast.
    expect(screen.getByText("Şimdi Denetçi gözüyle bakıyorsun.")).toHaveAttribute("role", "status");
  });

  it("takes its own test id", () => {
    renderWithDesk(<RolePicker testId="role-picker-x" />, new MockDb(null), "analyst");
    expect(screen.getByTestId("role-picker-x")).toHaveClass("tone-analyst");
  });
});
