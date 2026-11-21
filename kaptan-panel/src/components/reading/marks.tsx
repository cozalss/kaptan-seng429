"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi, useApiQuery } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import type { ReadingState } from "@/lib/domain/reading";

/** Fired after any change to the marks, so the unread number in the bar and the lists follow at once. */
export const READING_CHANGED = "kaptan:reading-changed";

export interface ReadingMarks {
  /** Null until the first answer. */
  state: ReadingState | null;
  isSaved: (index: number) => boolean;
  isUnread: (index: number) => boolean;
  toggleSaved: (index: number) => Promise<void>;
  open: (index: number) => Promise<void>;
  readAll: () => Promise<void>;
  error: string | null;
}

const Ctx = createContext<ReadingMarks | null>(null);

/** The person's marks (saved, unread) for one screen; every star and the counter read the same copy. */
export function ReadingMarksProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const q = useApiQuery((a) => a.readingState(), []);
  const [local, setLocal] = useState<ReadingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = local ?? q.data ?? null;
  const { refetch } = q;

  useEffect(() => {
    const again = () => void refetch().then(() => setLocal(null));
    window.addEventListener(READING_CHANGED, again);
    return () => window.removeEventListener(READING_CHANGED, again);
  }, [refetch]);

  const apply = useCallback(async (call: () => Promise<ReadingState>) => {
    setError(null);
    try {
      setLocal(await call());
      window.dispatchEvent(new Event(READING_CHANGED));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  const value = useMemo<ReadingMarks>(() => {
    const saved = new Set(state?.saved_indexes ?? []);
    const unread = new Set(state?.unread_indexes ?? []);
    return {
      state,
      isSaved: (i) => saved.has(i),
      isUnread: (i) => unread.has(i),
      toggleSaved: (i) => apply(() => api.setSaved(i, !saved.has(i))),
      open: async (i) => {
        if (unread.has(i)) await apply(() => api.markRead(i));
      },
      readAll: () => apply(() => api.readAll()),
      error,
    };
  }, [state, error, api, apply]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The marks, or null outside a provider (a row then simply shows no star). */
export function useReadingMarks(): ReadingMarks | null {
  return useContext(Ctx);
}
