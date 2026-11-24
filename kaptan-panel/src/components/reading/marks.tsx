"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "@/lib/api/react";
import { errorMessage, type KaptanApi } from "@/lib/api/types";
import type { ReadingState, TriageStateName } from "@/lib/domain/reading";

/** Fired after any change to the marks, so every copy of the unread number asks the server again. */
export const READING_CHANGED = "kaptan:reading-changed";
/** Carries a fresh ReadingState to every copy at once: the bar badge and the Okunanlar page show one number. */
export const READING_STATE = "kaptan:reading-state";

const POLL_MS = 60_000;

/** Hands a fresh answer to every listener (and to the caller's own copy). */
export function shareReadingState(state: ReadingState): void {
  window.dispatchEvent(new CustomEvent<ReadingState>(READING_STATE, { detail: state }));
}

/**
 * The person's reading state, shared: whichever copy asks the server (on mount, every minute, after a change)
 * hands the answer to all the others, so the badge and the page never show two different counts.
 */
export function useReadingState(): { state: ReadingState | null; error: string | null } {
  const api = useApi();
  const [state, setState] = useState<ReadingState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api.readingState();
      setError(null);
      shareReadingState(next);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [api]);

  useEffect(() => {
    const adopt = (e: Event) => setState((e as CustomEvent<ReadingState>).detail);
    const again = () => void load();
    window.addEventListener(READING_STATE, adopt);
    window.addEventListener(READING_CHANGED, again);
    const timer = window.setInterval(again, POLL_MS);
    again();
    return () => {
      window.removeEventListener(READING_STATE, adopt);
      window.removeEventListener(READING_CHANGED, again);
      window.clearInterval(timer);
    };
  }, [load]);

  return { state, error };
}

export interface ReadingMarks {
  /** Null until the first answer. */
  state: ReadingState | null;
  isSaved: (index: number) => boolean;
  isUnread: (index: number) => boolean;
  toggleSaved: (index: number) => Promise<void>;
  /** Where the person put this disclosure (act / read later / done), or null. "Sonra oku" is the same as saved. */
  triageOf: (index: number) => TriageStateName | null;
  /** Put a disclosure in a state; the same state again takes it out. */
  setTriage: (index: number, state: TriageStateName | null) => Promise<void>;
  open: (index: number) => Promise<void>;
  readAll: (important?: boolean) => Promise<void>;
  /** After "Hepsini okundu say": puts the earlier mark back. Null when there is nothing to undo. */
  undoReadAll: (() => Promise<void>) | null;
  error: string | null;
}

const Ctx = createContext<ReadingMarks | null>(null);

/** The person's marks (saved, unread) for one screen; every star and the counter read the same copy. */
export function ReadingMarksProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const shared = useReadingState();
  const [error, setError] = useState<string | null>(null);
  /** The mark before the last "Hepsini okundu say", for its "Geri al". */
  const [undoTo, setUndoTo] = useState<string | null>(null);
  const state = shared.state;

  const apply = useCallback(async (call: (a: KaptanApi) => Promise<ReadingState>): Promise<boolean> => {
    setError(null);
    try {
      shareReadingState(await call(api));
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }, [api]);

  const value = useMemo<ReadingMarks>(() => {
    const saved = new Set(state?.saved_indexes ?? []);
    const unread = new Set(state?.unread_indexes ?? []);
    const triage = new Map((state?.triage ?? []).map((t) => [t.disclosure_index, t.state] as const));
    return {
      state,
      isSaved: (i) => saved.has(i),
      isUnread: (i) => unread.has(i),
      toggleSaved: async (i) => void (await apply((a) => a.setSaved(i, !saved.has(i)))),
      triageOf: (i) => triage.get(i) ?? null,
      setTriage: async (i, next) => void (await apply((a) => a.setTriage(i, triage.get(i) === next ? null : next))),
      open: async (i) => {
        if (unread.has(i)) await apply((a) => a.markRead(i));
      },
      readAll: async (important = false) => {
        const before = state?.read_through ?? null;
        if (await apply((a) => a.readAll(important)) && important) setUndoTo(before);
      },
      undoReadAll: undoTo
        ? async () => {
            if (await apply((a) => a.restoreReadThrough(undoTo))) setUndoTo(null);
          }
        : null,
      error: error ?? shared.error,
    };
  }, [state, error, shared.error, undoTo, apply]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The marks, or null outside a provider (a row then simply shows no star). */
export function useReadingMarks(): ReadingMarks | null {
  return useContext(Ctx);
}
