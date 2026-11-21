"use client";

import { useRouter } from "next/navigation";
import { useApiQuery } from "@/lib/api/react";
import { raiseDesktopAlert } from "@/lib/alerts/desktop";
import { WATCH_ALERT } from "@/lib/alerts/alerts";
import { isMuted } from "@/lib/prefs/desktop-gate";
import { useEventStream } from "@/lib/sse/use-event-stream";

/**
 * A new disclosure for a company you watch: a desktop notification when you are not looking at the app (only if
 * you turned desktop alerts on). The text is one generic sentence; it never names the company. Renders nothing.
 */
export function WatchAlerts() {
  const router = useRouter();
  const list = useApiQuery((api) => api.watchlist(), []);
  const watched = new Set((list.data ?? []).map((w) => w.ticker));
  useEventStream("feed", {
    disclosure: (d) => {
      const codes = [d.primary_ticker, ...d.stock_codes];
      if (codes.some((c) => c !== null && watched.has(c) && !isMuted(c))) {
        raiseDesktopAlert(WATCH_ALERT, (path) => router.push(path));
        void list.refetch();
      }
    },
  });
  return null;
}
