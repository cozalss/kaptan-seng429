import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { KaptanApi } from "@/lib/api/types";
import type { WatchItem } from "@/lib/domain/company";
import { mockApi, renderWithApi } from "@/components/solo/money.test-utils";
import { DayLearned } from "./day-learned";
import { GettingStarted } from "./getting-started";
import { HomeHighlights } from "./home-highlights";
import { HomeTrack } from "./home-track";

vi.mock("next/navigation", async () => (await import("../nav.test-utils")).mockNavigation());

/** A started install with an empty watchlist that remembers what gets starred. */
function emptyWatchApi(): KaptanApi {
  const base = mockApi({ fresh: false });
  let list: WatchItem[] = [];
  return {
    ...base,
    watchlist: () => Promise.resolve(list),
    watch: (ticker: string) => {
      list = [{ ticker, name: "MİSAL YAZILIM A.Ş.", added_at: new Date().toISOString(), last_close: null, price_day: null, change_pct: null, newest_disclosure_at: null }];
      return Promise.resolve(list);
    },
  };
}

describe("Başlamak için", () => {
  it("shows the steps when nothing is held or watched, and a company can be followed from the home", async () => {
    const u = userEvent.setup({ delay: null });
    renderWithApi(<GettingStarted hasHoldings={false} />, emptyWatchApi());
    const card = await screen.findByRole("region", { name: "Başlamak için" });
    expect(within(card).getByText("0/3 tamam")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /Param’da ekle/ })).toHaveAttribute("href", "/portfoy#koydugun-para");
    expect(within(card).getByRole("link", { name: /Ayarlar’da bağla/ })).toHaveAttribute("href", "/ayarlar#telegram");
    expect(within(card).getByRole("link", { name: /Dökümü yükle/ })).toHaveAttribute("href", "/portfoy#dokum");
    await u.type(within(card).getByLabelText("İzlemek istediğin şirketi ara"), "misal");
    await u.click((await within(card).findAllByRole("button", { name: /: izle$/ }, { timeout: 2000 }))[0] as HTMLElement);
    await waitFor(() => expect(within(card).getByText("1/3 tamam")).toBeInTheDocument());
    expect(within(card).getByText(/^İzliyorsun: /)).toBeInTheDocument();
  });

  it("stays away for someone who already holds or watches", async () => {
    renderWithApi(<GettingStarted hasHoldings />, emptyWatchApi());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("region", { name: "Başlamak için" })).toBeNull();
  });
});

describe("KAPtan’ın önerdikleri", () => {
  it("lists recent suggestions with what was done and the result, with links to Karne and Geçmiş", async () => {
    renderWithApi(<HomeTrack />, mockApi({ fresh: false }));
    const block = await screen.findByRole("region", { name: "KAPtan’ın önerdikleri" });
    await waitFor(() => expect(within(block).getByText(/^Son 30 günde|^Henüz öneri yok|^Son 30 günde öneri yok/)).toBeInTheDocument());
    expect(within(block).getByRole("link", { name: /Karne/ })).toHaveAttribute("href", "/gecmis/karne");
    expect(within(block).getByRole("link", { name: /Geçmiş/ })).toHaveAttribute("href", "/gecmis");
  });

  it("is honest and friendly with no suggestion yet", async () => {
    const base = mockApi({ fresh: false });
    const real = await base.trackRecord();
    renderWithApi(<HomeTrack />, { ...base, trackRecord: () => Promise.resolve({ ...real, items: [] }) });
    expect(await screen.findByText(/^Henüz öneri yok\. KAPtan yalnız işlem hacmi yüksek hisselere/)).toBeInTheDocument();
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
