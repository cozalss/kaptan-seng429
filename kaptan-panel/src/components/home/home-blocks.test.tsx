import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, renderWithApi } from "@/components/solo/money.test-utils";
import { DayLearned } from "./day-learned";
import { HomeHighlights } from "./home-highlights";
import { HomeSuggested } from "./home-suggested";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

describe("Öneriye düşenler", () => {
  it("lists the newest suggestions, each opening its proposal, with its status and the result", async () => {
    const api = mockApi({ fresh: false });
    const cards = await api.listApprovals("all");
    renderWithApi(<HomeSuggested />, api);
    const block = await screen.findByRole("region", { name: "Öneriye düşenler" });
    const list = await within(block).findByRole("list", { name: "Son öneriler" });
    const rows = within(list).getAllByRole("link");
    expect(rows.length).toBe(Math.min(5, cards.length));
    expect(rows[0]?.getAttribute("href")).toMatch(/^\/oneri\//);
    expect(within(rows[0] as HTMLElement).getByText(/^(Bekliyor|Onayladın|Geçtin|Süresi doldu|İptal oldu)$/)).toBeInTheDocument();
    if (cards.length > 5) expect(within(block).getByRole("link", { name: (n) => n.startsWith(`Hepsi (${cards.length})`) })).toHaveAttribute("href", "/oneriler");
  });

  it("says plainly why nothing reached a suggestion yet, with the boat", async () => {
    const base = mockApi({ fresh: false });
    renderWithApi(<HomeSuggested />, { ...base, listApprovals: () => Promise.resolve([]) });
    expect(await screen.findByText(/^Henüz hiçbir duyuru öneriye dönüşmedi\./)).toBeInTheDocument();
  });
});

describe("KAPtan bugün ne öğrendi and Günün öne çıkanları", () => {
  it("draws the funnel with its numbers and plain takeaways, never the circular reason", async () => {
    renderWithApi(<DayLearned mine={0} />, mockApi({ fresh: false }));
    const block = await screen.findByRole("region", { name: "KAPtan bugün ne öğrendi" });
    await waitFor(() => expect(within(block).getByText("duyuru okundu", { exact: false })).toBeInTheDocument());
    expect(within(block).getByText("Senin hisselerinde önemli bir şey olmadı.")).toBeInTheDocument();
    expect(block.textContent).not.toMatch(/kurallar geçmedi|kurallardan geçmedi/);
    expect(within(block).getByRole("link", { name: /Hepsini gör/ })).toHaveAttribute("href", "/onemli");
  });

  it("shows the week's lesson and links to Ne öğrendim; a failed read only hides the lesson", async () => {
    renderWithApi(<DayLearned mine={0} />, mockApi({ fresh: false }));
    const block = await screen.findByRole("region", { name: "KAPtan bugün ne öğrendi" });
    expect(await within(block).findByTestId("ders")).toHaveTextContent("geri alım eşiğini");
    expect(within(block).getByRole("link", { name: /Ne öğrendim/ })).toHaveAttribute("href", "/ogrendiklerim");
  });

  it("keeps the block when the learning report cannot be read", async () => {
    const base = mockApi({ fresh: false });
    renderWithApi(<DayLearned mine={0} />, { ...base, getLearning: () => Promise.reject(new Error("down")) });
    const block = await screen.findByRole("region", { name: "KAPtan bugün ne öğrendi" });
    await waitFor(() => expect(within(block).getByText("duyuru okundu", { exact: false })).toBeInTheDocument());
    expect(within(block).queryByTestId("ders")).toBeNull();
  });

  it("shows compact rows in title case that open in place", async () => {
    const u = userEvent.setup({ delay: null });
    renderWithApi(<HomeHighlights />, mockApi({ fresh: false }));
    const block = await screen.findByRole("region", { name: "Günün öne çıkanları" });
    const rows = await within(block).findAllByRole("button", { expanded: false });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(6);
    expect(block.textContent).not.toMatch(/A\.Ş\./);
    await u.click(rows[0] as HTMLElement);
    expect(within(block).getAllByRole("link", { name: /Duyuruyu aç/ }).length).toBe(1);
  });
});
