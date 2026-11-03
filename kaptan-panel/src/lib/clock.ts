"use client";

import { useEffect, useState } from "react";
import { API_MODE } from "@/lib/api/config";
import { localRuntime } from "@/lib/api/local-runtime";

/**
 * http mode: the server's "now" minus the browser's, learnt from the `as_of` of answers that
 * carry the server's current time (counters, risk status — the shell asks for both on every
 * screen); it corrects a skewed browser clock. Until the first such answer the UI shows no time at all,
 * so the browser's own date never flashes next to the server's deadlines.
 */
let serverOffsetMs = 0;
let serverTimeKnown = false;
const listeners = new Set<() => void>();

/** A server offset that moves less than this is clock jitter, not news worth a re-render. */
const OFFSET_JITTER_MS = 1_000;

/** Record the server's current time (an ISO `as_of` that means "now" on the server). */
export function noteServerTime(iso: string, receivedAtMs: number = Date.now()): void {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return;
  const offset = t - receivedAtMs;
  const changed = !serverTimeKnown || Math.abs(offset - serverOffsetMs) > OFFSET_JITTER_MS;
  serverOffsetMs = offset;
  serverTimeKnown = true;
  if (changed) for (const listener of listeners) listener();
}

/** The server's "now" as far as this tab knows (browser clock + the last noted offset). */
export function serverNowMs(browserNowMs: number = Date.now()): number {
  return browserNowMs + serverOffsetMs;
}

/**
 * "Now" for the UI: the browser clock corrected to the server's (noteServerTime). The test
 * double has its own clock (11.01.2027 13:40 + elapsed real time).
 * Countdowns, the date line and which order slips are still open use it.
 */
export function currentTimeMs(): number {
  const local = API_MODE === "mock" && typeof window !== "undefined" ? localRuntime() : null;
  return local ? local.nowMs() : serverNowMs();
}

/** What useNow shows: null in http mode until the server's clock is known. */
function visibleNow(): number | null {
  return API_MODE === "http" && !serverTimeKnown ? null : currentTimeMs();
}

/**
 * Re-renders every `intervalMs`, and at once when the server's clock is first learnt or jumps.
 * Returns null until mounted (avoids hydration mismatch) and, in http mode,
 * until the server's time is known.
 */
export function useNow(intervalMs = 1_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(visibleNow());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    listeners.add(tick);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      listeners.delete(tick);
    };
  }, [intervalMs]);
  return now;
}
