"use client";

import { useCallback, useState } from "react";
import { useApi } from "@/lib/api/react";
import { errorMessage, type KaptanApi } from "@/lib/api/types";

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Like useApiMutation, but the result says whether the call succeeded — needed for
 * void endpoints (confirm removal, tamper) where `undefined` is also the success value.
 */
export function useAction() {
  const api = useApi();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(fn: (api: KaptanApi) => Promise<T>): Promise<ActionResult<T>> => {
      setPending(true);
      setError(null);
      try {
        return { ok: true, value: await fn(api) };
      } catch (e) {
        const message = errorMessage(e);
        setError(message);
        return { ok: false, error: message };
      } finally {
        setPending(false);
      }
    },
    [api],
  );

  const reset = useCallback(() => setError(null), []);
  return { run, pending, error, reset };
}
