"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChainVerifyResult } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { provisionalPosition, walkPosition, walkTarget } from "./audit-logic";

/**
 * "Zinciri doğrula" as a visible walk (FRONTEND-SPEC §2.7): POST /audit/verify runs on the
 * server (side-effect free); meanwhile a cursor walks the chain and, once the answer is in,
 * finishes at the head (OK) or stops on the first broken position. The walk only ever
 * shows what the server reported — it never claims more than `checked`.
 */
export type WalkState =
  | { phase: "idle" }
  | { phase: "walking"; pos: number }
  | { phase: "done"; pos: number; result: ChainVerifyResult }
  | { phase: "error"; message: string };

const FINISH_MS = 1_400;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useChainWalk(total: number, onDone?: (r: ChainVerifyResult) => void) {
  const api = useApi();
  const [state, setState] = useState<WalkState>({ phase: "idle" });
  const raf = useRef<number | null>(null);
  const run = useRef(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const stop = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  useEffect(() => stop, []);

  const start = useCallback(async () => {
    stop();
    const mine = ++run.current;
    const t0 = performance.now();
    const reduced = prefersReducedMotion();
    let result: ChainVerifyResult | null = null;
    let arrivedAt = 0;
    let fromPos = 1;
    let lastPos = 1;
    setState({ phase: "walking", pos: 1 });

    const frame = (now: number) => {
      if (mine !== run.current) return;
      if (!result) {
        lastPos = provisionalPosition(now - t0, Math.max(1, total));
        setState({ phase: "walking", pos: lastPos });
      } else {
        const target = walkTarget(result);
        const pos = fromPos + (walkPosition(now - arrivedAt, FINISH_MS, Math.max(1, target - fromPos + 1)) - 1);
        lastPos = Math.min(target, Math.max(fromPos, pos));
        if (now - arrivedAt >= FINISH_MS) {
          setState({ phase: "done", pos: target, result });
          onDoneRef.current?.(result);
          raf.current = null;
          return;
        }
        setState({ phase: "walking", pos: lastPos });
      }
      raf.current = requestAnimationFrame(frame);
    };
    if (!reduced) raf.current = requestAnimationFrame(frame);

    try {
      const r = await api.verifyAudit();
      if (mine !== run.current) return;
      result = r;
      if (reduced) {
        setState({ phase: "done", pos: walkTarget(r), result: r });
        onDoneRef.current?.(r);
        return;
      }
      arrivedAt = performance.now();
      fromPos = Math.min(lastPos, walkTarget(r));
    } catch (e) {
      if (mine !== run.current) return;
      stop();
      setState({ phase: "error", message: errorMessage(e) });
    }
  }, [api, total]);

  const reset = useCallback(() => {
    run.current += 1;
    stop();
    setState({ phase: "idle" });
  }, []);

  return { state, start, reset };
}
