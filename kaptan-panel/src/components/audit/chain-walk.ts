"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChainVerifyResult } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";

/**
 * "Defteri doğrula": ask the API to walk the chain, then replay the walk on screen — a count
 * running from the first record to the last (or to the broken one) — so the result is seen,
 * not just announced. Reduced motion: the result appears at once.
 */
export type Walk =
  | { phase: "idle" }
  | { phase: "walking"; checked: number; total: number }
  | { phase: "done"; result: ChainVerifyResult; total: number }
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

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    let chainLength = length;
    try {
      result = await api.verifyAudit();
      // Asked before the list arrived (the guided demo does this): read the length first.
      if (chainLength === 0) chainLength = (await api.auditList({ scope: "all", limit: 1 })).length;
    } catch (e) {
      setWalk({ phase: "error", message: errorMessage(e) });
      return;
    }
    const total = Math.max(chainLength, walkTarget(result));
    const target = walkTarget(result);
    if (reducedMotion() || typeof requestAnimationFrame !== "function") {
      setWalk({ phase: "done", result, total });
      return;
    }
    const start = performance.now();
    const step = (t: number) => {
      const checked = walkProgress(t - start, target);
      if (checked >= target) {
        frame.current = null;
        setWalk({ phase: "done", result, total });
        return;
      }
      setWalk({ phase: "walking", checked, total });
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [api, length]);

  return { walk, verify, reset: () => setWalk({ phase: "idle" }) };
}
