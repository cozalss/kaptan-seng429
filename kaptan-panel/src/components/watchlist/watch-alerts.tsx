"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useApi } from "@/lib/api/react";
import { raiseDesktopAlert } from "@/lib/alerts/desktop";
import { isMuted } from "@/lib/prefs/desktop-gate";
import { burstAlert } from "@/lib/signal/signal";
import type { SignalItem } from "@/lib/domain/signal";
import { useEventStream } from "@/lib/sse/use-event-stream";

/** Disclosures that arrive within this window are told as one alert ("THYAO ve 2 şirket daha"). */
export const BURST_MS = 4_000;
/**
 * A disclosure of yours that is not important yet (an insider form whose buy/sell is read a little later) or
 * that could not be fetched is asked again after these waits; it rings once it becomes important.
 */
export const RECHECK_MS: readonly number[] = [30_000, 120_000, 600_000];

/**
 * A new IMPORTANT disclosure of a company you hold or watch: a desktop notification when you are not looking at
 * the app (only if you turned desktop alerts on). The notification stays on this computer, so it names the company
 * and says the one plain line; a click opens that disclosure in the reading drawer. A burst becomes one alert with
 * a link to the list. Unimportant disclosures (noise, archive-only, corrections) never ring. Renders nothing.
 */
export function WatchAlerts() {
  const router = useRouter();
  const api = useApi();
  const pending = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rechecks = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pendingRechecks = rechecks.current;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const t of pendingRechecks) clearTimeout(t);
      pendingRechecks.clear();
    };
  }, []);

  const ask = async (indexes: readonly number[], attempt: number) => {
    const found = await Promise.all(indexes.map((i) => api.signal(i).catch(() => null)));
    const mine = found.filter((s): s is SignalItem => s !== null && s.important && s.mine !== null && !(s.ticker !== null && isMuted(s.ticker)));
    const alert = burstAlert(mine);
    if (alert) raiseDesktopAlert({ kind: "watch", body: alert.body, path: alert.path }, (path) => router.push(path));
    const later = indexes.filter((_, n) => {
      const s = found[n];
      return s == null || (!s.important && s.mine !== null);
    });
    const wait = RECHECK_MS[attempt];
    if (later.length === 0 || wait === undefined) return;
    const t = setTimeout(() => {
      rechecks.current.delete(t);
      void ask(later, attempt + 1);
    }, wait);
    rechecks.current.add(t);
  };

  const flush = async () => {
    const indexes = [...new Set(pending.current)];
    pending.current = [];
    timer.current = null;
    await ask(indexes, 0);
  };

  useEventStream("feed", {
    disclosure: (d) => {
      pending.current.push(d.disclosure_index);
      timer.current ??= setTimeout(() => void flush(), BURST_MS);
    },
  });
  return null;
}
