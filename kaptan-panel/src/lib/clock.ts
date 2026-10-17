"use client";

import { useEffect, useState } from "react";
import { API_MODE } from "@/lib/api/config";
import { getMockDb } from "@/lib/api/mock/db";
import { nowMs } from "@/lib/api/mock/selectors";

/**
 * http mode: the server's "now" minus the browser's, learnt from the `as_of` of answers that
 * carry the server's current time (counters, risk status). With the backend's DEMO_MODE that is
 * the demo clock (11.01.2027 …); in production it only corrects a skewed browser clock.
 */
let serverOffsetMs = 0;

/** Record the server's current time (an ISO `as_of` that means "now" on the server). */
export function noteServerTime(iso: string, receivedAtMs: number = Date.now()): void {
  const t = Date.parse(iso);
  if (Number.isFinite(t)) serverOffsetMs = t - receivedAtMs;
}

/** The server's "now" as far as this tab knows (browser clock + the last noted offset). */
export function serverNowMs(browserNowMs: number = Date.now()): number {
  return browserNowMs + serverOffsetMs;
}

/**
 * "Now" for the UI. In mock mode this is the demo clock (11.01.2027 13:40 + elapsed real
 * time); in http mode it is the browser clock corrected to the server's (noteServerTime).
 * Countdowns, the date line and which order slips are still open use it.
 */
export function currentTimeMs(): number {
  if (API_MODE === "mock" && typeof window !== "undefined") return nowMs(getMockDb().snapshot);
  return serverNowMs();
}

/** Re-renders every `intervalMs`; returns null until mounted (avoids hydration mismatch). */
export function useNow(intervalMs = 1_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(currentTimeMs());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}
