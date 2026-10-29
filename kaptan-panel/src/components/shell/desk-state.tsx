"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ApprovalCard, DayCounters, RiskStatus } from "@/lib/domain";
import { ROUTES, href } from "@/lib/nav";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { useEventStream, type StreamStatus } from "@/lib/sse/use-event-stream";
import { notify } from "@/components/ui/toast";

/**
 * Desk-wide live state for the shell and the three screens: today's counters,
 * risk status and pending proposals, kept fresh by /stream/feed and
 * /stream/desk. Screens read it with `useDesk()` instead of refetching the same things.
 */
export interface DeskState {
  counters: DayCounters | null;
  risk: RiskStatus | null;
  pending: ApprovalCard[];
  feedStatus: StreamStatus;
  deskStatus: StreamStatus;
  /** Why the last refresh failed, in plain words (null once a refresh succeeds). */
  error: string | null;
  refresh: () => Promise<void>;
  /** Bumped after "Demo verisini sıfırla": screens keyed on it remount and refetch. */
  epoch: number;
  /** Refetch the shell state and remount the current screen (no full page reload). */
  resetView: () => void;
}

const DeskContext = createContext<DeskState | null>(null);

export function DeskStateProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const [counters, setCounters] = useState<DayCounters | null>(null);
  const [risk, setRisk] = useState<RiskStatus | null>(null);
  const [pending, setPending] = useState<ApprovalCard[]>([]);
  const [epoch, setEpoch] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // A risk event that lands while a refresh is in flight is newer than the refresh's read.
  const riskVersion = useRef(0);
  const setLiveRisk = useCallback((r: RiskStatus) => {
    riskVersion.current += 1;
    setRisk(r);
  }, []);

  const refresh = useCallback(async () => {
    const startedAt = riskVersion.current;
    try {
      const [c, r, p] = await Promise.all([api.counters(), api.riskStatus(), api.listApprovals("pending")]);
      setCounters(c);
      if (riskVersion.current === startedAt) setRisk(r);
      setPending(p);
      setError(null);
    } catch (e) {
      // The shell itself stays quiet; Bugün and Portföy show this with a retry (ErrorState).
      setError(errorMessage(e));
    }
  }, [api]);

  useEffect(() => {
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, [refresh]);

  const feedStatus = useEventStream("feed", {
    counters: (c) => setCounters(c),
  });

  const deskStatus = useEventStream("desk", {
    "approval.requested": (card) => {
      setPending((list) => [card, ...list.filter((x) => x.proposal_id !== card.proposal_id)]);
      // On Bugün the card arrives in place; elsewhere one quiet slip says so.
      if (pathname === ROUTES.bugun) return;
      notify.event(`Yeni öneri: ${card.company_name}`, undefined, {
        label: "İncele",
        onClick: () => router.push(href.proposal(card.proposal_id)),
      });
    },
    "approval.decided": (card) => setPending((list) => list.filter((x) => x.proposal_id !== card.proposal_id)),
    kill_switch: (r) => {
      setLiveRisk(r);
      if (r.kill_switch === "on") setPending([]);
    },
    halt: (r) => setLiveRisk(r),
    regime: (r) => setLiveRisk(r),
  });

  const resetView = useCallback(() => {
    setEpoch((n) => n + 1);
    void refresh();
  }, [refresh]);

  const value = useMemo<DeskState>(
    () => ({ counters, risk, pending, feedStatus, deskStatus, error, refresh, epoch, resetView }),
    [counters, risk, pending, feedStatus, deskStatus, error, refresh, epoch, resetView],
  );
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

/** Remounts its children whenever the demo data is reset (see `resetView`). */
export function ResetBoundary({ children }: { children: ReactNode }) {
  const { epoch } = useDesk();
  return <Fragment key={epoch}>{children}</Fragment>;
}

export function useDesk(): DeskState {
  const ctx = useContext(DeskContext);
  if (!ctx) throw new Error("useDesk must be used inside <DeskStateProvider>");
  return ctx;
}
