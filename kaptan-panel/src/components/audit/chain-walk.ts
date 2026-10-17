"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditEntry, ChainVerifyResult } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { errorMessage, type KaptanApi } from "@/lib/api/types";
import { prefersReducedMotion } from "@/lib/utils";

/**
 * "Defteri doğrula": ask the API to walk the chain, then replay the walk on screen — a count
 * running from the first record to the last (or to the broken one) — so the result is seen,
 * not just announced. Reduced motion: the result appears at once.
 */
export type Walk =
  | { phase: "idle" }
  | { phase: "walking"; checked: number; total: number }
  | { phase: "done"; result: ChainVerifyResult; total: number; bad: AuditEntry | null }
  | { phase: "error"; message: string };

const WALK_MS = 1_400;

/** Where the walk stops: the broken record, or the end of the chain. */
export function walkTarget(result: ChainVerifyResult): number {
  return result.ok ? result.checked : (result.first_bad_pos ?? result.checked);
}

/** Records counted after `elapsed` ms of a walk to `target` (ease-out). */
export function walkProgress(elapsed: number, target: number, duration = WALK_MS): number {
  const t = Math.min(1, Math.max(0, elapsed / duration));
  return Math.round(target * (1 - (1 - t) ** 3));
}

/** Repaint the count at most every 33 ms, and only once it moved 1/120 of the way. */
const FRAME_MS = 33;
const STEPS = 120;

/** Should the walk show a new count? (Throttles setState; the last record always shows.) */
export function shouldPaint(checked: number, last: number, target: number, sinceMs: number): boolean {
  if (checked >= target) return true;
  return sinceMs >= FRAME_MS && checked - last >= Math.max(1, target / STEPS);
}

/** The broken record itself, so the verdict can show it (null when it cannot be read). */
async function brokenEntry(api: KaptanApi, result: ChainVerifyResult): Promise<AuditEntry | null> {
  if (result.ok || result.first_bad_pos === null) return null;
  try {
    const found = await api.auditList({ scope: "all", q: `#${result.first_bad_pos}`, limit: 1 });
    return found.items[0] ?? null;
  } catch {
    // The verdict stands without the record; the ledger below still lists it.
    return null;
  }
}

/** The guided demo asks the open Denetim screen to verify (no query string needed). */
export const VERIFY_EVENT = "kaptan:verify-ledger";

export function requestVerify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(VERIFY_EVENT));
}

export function useChainWalk(length: number) {
  const api = useApi();
  const [walk, setWalk] = useState<Walk>({ phase: "idle" });
  const frame = useRef<number | null>(null);
  useEffect(() => () => (frame.current !== null ? cancelAnimationFrame(frame.current) : undefined), []);

  const verify = useCallback(async () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    setWalk({ phase: "walking", checked: 0, total: length });
    let result: ChainVerifyResult;
    let bad: AuditEntry | null;
    let chainLength = length;
    try {
      result = await api.verifyAudit();
      // Asked before the list arrived (the guided demo does this): read the length first.
      if (chainLength === 0) chainLength = (await api.auditList({ scope: "all", limit: 1 })).length;
      bad = await brokenEntry(api, result);
    } catch (e) {
      setWalk({ phase: "error", message: errorMessage(e) });
      return;
    }
    const total = Math.max(chainLength, walkTarget(result));
    const target = walkTarget(result);
    const done: Walk = { phase: "done", result, total, bad };
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      setWalk(done);
      return;
    }
    const start = performance.now();
    let lastAt = start;
    let lastChecked = 0;
    const step = (t: number) => {
      const checked = walkProgress(t - start, target);
      if (checked >= target) {
        frame.current = null;
        setWalk(done);
        return;
      }
      if (shouldPaint(checked, lastChecked, target, t - lastAt)) {
        lastAt = t;
        lastChecked = checked;
        setWalk({ phase: "walking", checked, total });
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [api, length]);

  return { walk, verify, reset: () => setWalk({ phase: "idle" }) };
}

/** The strip under "Defteri doğrula": 48 square segments, each about total/48 records. */
export const SEGMENTS = 48;
export type Segment = "ink" | "north" | "dashed" | "blank";

/**
 * Which segments the walk has inked. A segment is inked once every record in it was checked;
 * on a break the segment holding the broken record turns north and the rest are dashed
 * (never walked: nothing after the break can be trusted). Pure.
 */
export function walkSegments(checked: number, total: number, badPos: number | null, count = SEGMENTS): Segment[] {
  const per = Math.max(1, Math.ceil(total / count));
  return Array.from({ length: count }, (_, i): Segment => {
    if (badPos !== null) {
      const bad = Math.ceil(badPos / per) - 1;
      return i < bad ? "ink" : i === bad ? "north" : "dashed";
    }
    const end = Math.min((i + 1) * per, total);
    return total > 0 && checked >= end ? "ink" : "blank";
  });
}
