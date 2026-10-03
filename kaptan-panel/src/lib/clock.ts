"use client";

import { useEffect, useState } from "react";
import { API_MODE } from "@/lib/api/config";
import { getMockDb } from "@/lib/api/mock/db";
import { nowMs } from "@/lib/api/mock/selectors";

/**
 * "Now" for the UI. In mock mode this is the demo clock (11.01.2027 13:40 + elapsed real
 * time); in http mode it is the browser clock. Countdowns and the session badge use it.
 */
export function currentTimeMs(): number {
  if (API_MODE === "mock" && typeof window !== "undefined") return nowMs(getMockDb().snapshot);
  return Date.now();
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
