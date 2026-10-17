"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useOptionalSession } from "@/lib/auth/session-context";
import { createClient } from "@/lib/api/client";
import type { Role } from "@/lib/domain/user";
import { ApiError, errorMessage, type KaptanApi } from "./types";

const ApiContext = createContext<KaptanApi | null>(null);

/** Mock mode: keep the chosen role in the session cookie so a reload keeps it. */
async function storeMockRole(role: Role): Promise<void> {
  const res = await fetch("/api/mock/session", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
  if (!res.ok) throw new ApiError(res.status, "role", "Rol değiştirilemedi; oturum süresi dolmuş olabilir.");
}

/**
 * Provides the one API client for the tree. Mock or http is decided at build time by
 * NEXT_PUBLIC_API_MODE: `@/lib/api/client` is aliased to client.mock.ts or client.http.ts
 * (next.config.ts), so each build carries only its own client.
 */
export function ApiProvider({ children, api }: { children: ReactNode; api?: KaptanApi }) {
  const session = useOptionalSession();
  const uid = session?.uid ?? null;
  const name = session?.name ?? "";
  const role = session?.role ?? null;
  // One client per signed-in person and role (signing out or switching role replaces it).
  const client = useMemo<KaptanApi>(() => {
    if (api) return api;
    const actor = uid && role ? { uid, name, role } : null;
    return createClient({ getActor: () => actor, onRoleChange: storeMockRole });
  }, [api, uid, name, role]);
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): KaptanApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi must be used inside <ApiProvider>");
  return api;
}

export interface QueryState<T> {
  data: T | undefined;
  error: string | null;
  /** True only before the first result (use `refreshing` for later reloads). */
  loading: boolean;
  refreshing: boolean;
  refetch: () => Promise<void>;
}

/**
 * Minimal data hook: runs `fn(api)` on mount and whenever `deps` change; keeps the last
 * data while refetching so live updates never flash a skeleton.
 */
export function useApiQuery<T>(fn: (api: KaptanApi) => Promise<T>, deps: ReadonlyArray<unknown> = []): QueryState<T> {
  const api = useApi();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const seq = useRef(0);

  const run = useCallback(async () => {
    const mine = ++seq.current;
    // Yield once so state updates never run synchronously inside the effect that called us.
    await Promise.resolve();
    if (mine !== seq.current) return;
    setRefreshing(true);
    try {
      const result = await fnRef.current(api);
      if (mine !== seq.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      setError(errorMessage(e));
    } finally {
      if (mine === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [api]);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the caller's query key
  }, [run, ...deps]);

  return { data, error, loading, refreshing, refetch: run };
}

export interface MutationState<A extends unknown[], R> {
  run: (...args: A) => Promise<R | undefined>;
  pending: boolean;
  error: string | null;
  reset: () => void;
}

/** Wraps a mutation: tracks pending/error and returns undefined on failure (never throws). */
export function useApiMutation<A extends unknown[], R>(fn: (api: KaptanApi, ...args: A) => Promise<R>): MutationState<A, R> {
  const api = useApi();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const run = useCallback(
    async (...args: A) => {
      setPending(true);
      setError(null);
      try {
        return await fnRef.current(api, ...args);
      } catch (e) {
        setError(errorMessage(e));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [api],
  );
  return { run, pending, error, reset: () => setError(null) };
}
