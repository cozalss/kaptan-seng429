import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { stopAllTimers, stopLiveTicker } from "@/lib/api/mock/scenarios";
import { __setMockDb } from "@/lib/api/mock/db";
import { renderWithDesk } from "../harness.test-utils";
import { DisclosuresScreen } from "./disclosures-screen";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
  __setMockDb(null);
});

describe("Bildirimler", () => {
  it("lists the session's disclosures with what happened, and filters them", async () => {
    renderWithDesk(<DisclosuresScreen />);
    expect(await screen.findByRole("heading", { level: 1, name: "Bildirimler" })).toBeInTheDocument();
    const list = await screen.findByRole("group", { name: "Bildirim listesi" });
    const all = within(list).getAllByRole("listitem").length;
    // 25 at first, cut by the hour under sticky bands.
    expect(all).toBe(25);
    expect(within(list).getAllByRole("heading", { level: 3 })[0]).toHaveTextContent(/^\d\d:00–\d\d:00\d+ bildirim$/);
    expect(screen.getByRole("button", { name: /tane daha göster/ })).toBeInTheDocument();

    const u = userEvent.setup({ delay: null });
    await u.click(screen.getByRole("button", { name: /^Tayfaya gönderildi/ }));
    await waitFor(() => expect(within(screen.getByRole("group", { name: "Bildirim listesi" })).getAllByRole("listitem").length).toBeLessThan(all));
    const crew = within(screen.getByRole("group", { name: "Bildirim listesi" }));
    // Each row carries its pill twice (phone and desktop placement; one is display:none).
    expect(crew.getAllByText("tayfaya gönderildi")).toHaveLength(crew.getAllByRole("listitem").length * 2);
    expect(crew.queryByText("elendi")).toBeNull();

    await u.type(screen.getByRole("searchbox", { name: "Hisse ya da şirket ara" }), "zzzz");
    expect(await screen.findByText("Bu aramaya uyan bildirim yok.")).toBeInTheDocument();
  });

  it("steps back one session", async () => {
    renderWithDesk(<DisclosuresScreen />);
    await screen.findByRole("group", { name: "Bildirim listesi" });
    await userEvent.setup({ delay: null }).click(screen.getByRole("button", { name: "← Önceki seans" }));
    expect(await screen.findByText(/8 Ocak Cuma/)).toBeInTheDocument();
  });
});
