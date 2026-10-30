"use client";

import { useCallback, useState } from "react";
import type { HoldAck } from "./activity";

/**
 * "TUT" answers kept on this device. A hold sends no order, so there is nothing to tell the
 * backend; the card simply leaves the list and "Son işlemler" says "X elinde kalıyor".
 */
export const HOLDS_KEY = "kaptan-solo-holds";
const MAX_HOLDS_KEPT = 20;

export function readHolds(storage: Pick<Storage, "getItem"> | null): HoldAck[] {
  try {
    const raw = storage?.getItem(HOLDS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (h): h is HoldAck => typeof h === "object" && h !== null && typeof h.id === "string" && typeof h.symbol === "string" && typeof h.at === "string" && (h.answer === undefined || h.answer === "held" || h.answer === "skipped"),
    );
  } catch {
    return [];
  }
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function useHolds(): { holds: HoldAck[]; addHold: (h: HoldAck) => void } {
  const [holds, setHolds] = useState<HoldAck[]>(() => readHolds(browserStorage()));
  const addHold = useCallback((h: HoldAck) => {
    setHolds((prev) => {
      const next = [h, ...prev.filter((p) => p.id !== h.id)].slice(0, MAX_HOLDS_KEPT);
      try {
        browserStorage()?.setItem(HOLDS_KEY, JSON.stringify(next));
      } catch {
        // Storage blocked (private mode): the answer lasts for this visit only.
      }
      return next;
    });
  }, []);
  return { holds, addHold };
}
