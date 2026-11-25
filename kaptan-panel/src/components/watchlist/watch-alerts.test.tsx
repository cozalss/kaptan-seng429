import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SignalItem } from "@/lib/domain/signal";

const raise = vi.fn();
const signal = vi.fn();
let onDisclosure: ((d: { disclosure_index: number }) => void) | undefined;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api/react", () => ({ useApi: () => ({ signal }) }));
vi.mock("@/lib/alerts/desktop", () => ({ raiseDesktopAlert: (...a: unknown[]) => raise(...a) }));
vi.mock("@/lib/prefs/desktop-gate", () => ({ isMuted: () => false }));
vi.mock("@/lib/sse/use-event-stream", () => ({
  useEventStream: (_s: string, h: { disclosure: (d: { disclosure_index: number }) => void }) => {
    onDisclosure = h.disclosure;
    return "open";
  },
}));

import { BURST_MS, RECHECK_MS, WatchAlerts } from "./watch-alerts";

function item(important: boolean): SignalItem {
  return {
    disclosure_index: 7,
    ticker: "TK7",
    company: "Deneme",
    published_at: "2026-11-24T10:00:00.000Z",
    kind: important ? "insider" : null,
    important,
    mine: "held",
    line_tr: "Yönetici ya da büyük ortak hisse sattı.",
    tone: important ? "olumsuz" : "belirsiz",
    so_what_tr: null,
    suggestion_tr: null,
    kap_url: "https://www.kap.org.tr/tr/Bildirim/7",
    panel_path: "/bildirimler?gun=2026-11-24&bildirim=7",
  } as unknown as SignalItem;
}

describe("WatchAlerts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    raise.mockReset();
    signal.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("rings for a disclosure of mine that becomes important after the burst window (insider direction read later)", async () => {
    signal.mockResolvedValueOnce(item(false)).mockResolvedValueOnce(item(true));
    render(<WatchAlerts />);
    act(() => onDisclosure?.({ disclosure_index: 7 }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(BURST_MS)));
    expect(raise).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(RECHECK_MS[0]!)));
    expect(signal).toHaveBeenCalledTimes(2);
    expect(raise).toHaveBeenCalledTimes(1);
  });

  it("asks again after a failed fetch and gives up after the last wait", async () => {
    signal.mockRejectedValue(new Error("down"));
    render(<WatchAlerts />);
    act(() => onDisclosure?.({ disclosure_index: 7 }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(BURST_MS + RECHECK_MS.reduce((a, b) => a + b, 0) + 1_000)));
    expect(signal).toHaveBeenCalledTimes(1 + RECHECK_MS.length);
    expect(raise).not.toHaveBeenCalled();
  });
});
