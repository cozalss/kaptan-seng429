"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ApprovalCard, DayCounters, RiskStatus, SystemStatus } from "@/lib/domain";
import { alertFor, type DeskSignal } from "@/lib/alerts/alerts";
import { raiseDesktopAlert } from "@/lib/alerts/desktop";
import { HOME, href } from "@/lib/nav";
import { useApi } from "@/lib/api/react";
import { errorMessage, isUnreachable } from "@/lib/api/types";
import { useEventStream, type StreamStatus } from "@/lib/sse/use-event-stream";
import { notify } from "@/components/ui/toast";
import { startGentlePoll } from "./gentle-poll";

/**
 * Live state for the shell and the screens: today's counters,
 * risk status and pending proposals, kept fresh by /stream/feed and
 * /stream/desk, and whether KAPtan itself is working, asked once a minute. Screens read it with
 * `useDesk()` instead of refetching the same things.
 */
const SYSTEM_EVERY_MS = 60_000;
/** While the API does not answer, look again sooner: the line goes away soon after it is back. */
const SYSTEM_RETRY_MS = 15_000;

export interface DeskState {
  counters: DayCounters | null;
  risk: RiskStatus | null;
  pending: ApprovalCard[];
  feedStatus: StreamStatus;
  deskStatus: StreamStatus;
  /** Why the last refresh failed, in plain words (null once a refresh succeeds). */
  error: string | null;
  /** What KAPtan says about itself (GET /system/status); null before the first answer. */
  system: SystemStatus | null;
  /** The API did not answer the last time it was asked. */
  systemDown: boolean;
  /** Ask again now (Ayarlar · Sistem). */
  refreshSystem: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Bumped by `resetView`: screens keyed on it remount and refetch. */
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
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [systemDown, setSystemDown] = useState(false);

  // A risk event that lands while a refresh is in flight is newer than the refresh's read.
  const riskVersion = useRef(0);
  const setLiveRisk = useCallback((r: RiskStatus) => {
    riskVersion.current += 1;
    setRisk(r);
  }, []);

  // Desktop alerts (off until turned on in Ayarlar): a stop alerts once, when it begins.
  const riskRef = useRef<RiskStatus | null>(null);
  useEffect(() => {
    riskRef.current = risk;
  }, [risk]);
  const alertOn = (signal: DeskSignal) => {
    const alert = alertFor(signal, riskRef.current);
    if (alert) raiseDesktopAlert(alert, (path) => router.push(path));
  };

  // A failed answer keeps the last status; only "nothing answers" is worth a line of its own.
  const downRef = useRef(false);
  const refreshSystem = useCallback(async () => {
    try {
      setSystem(await api.systemStatus());
      downRef.current = false;
    } catch (e) {
      downRef.current = isUnreachable(e);
    }
    setSystemDown(downRef.current);
  }, [api]);
  useEffect(() => startGentlePoll({ run: refreshSystem, everyMs: () => (downRef.current ? SYSTEM_RETRY_MS : SYSTEM_EVERY_MS) }), [refreshSystem]);

  const refresh = useCallback(async () => {
    const startedAt = riskVersion.current;
    try {
      const [c, r, p] = await Promise.all([api.counters(), api.riskStatus(), api.listApprovals("pending")]);
      setCounters(c);
      if (riskVersion.current === startedAt) setRisk(r);
      setPending(p);
      setError(null);
    } catch (e) {
      // The shell itself stays quiet; Param shows this with a retry (ErrorState).
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
      alertOn({ event: "approval.requested", data: card });
      // On the home the card arrives in place; elsewhere one quiet slip says so.
      if (pathname === HOME) return;
      notify.event(`Yeni öneri: ${card.company_name}`, undefined, {
        label: "İncele",
        onClick: () => router.push(href.proposal(card.proposal_id)),
      });
    },
    "approval.decided": (card) => setPending((list) => list.filter((x) => x.proposal_id !== card.proposal_id)),
    kill_switch: (r) => {
      alertOn({ event: "kill_switch", data: r });
      setLiveRisk(r);
      if (r.kill_switch === "on") setPending([]);
    },
    halt: (r) => {
      alertOn({ event: "halt", data: r });
      setLiveRisk(r);
    },
    regime: (r) => setLiveRisk(r),
  });

  const resetView = useCallback(() => {
    setEpoch((n) => n + 1);
    void refresh();
  }, [refresh]);

  const value = useMemo<DeskState>(
    () => ({ counters, risk, pending, feedStatus, deskStatus, error, system, systemDown, refreshSystem, refresh, epoch, resetView }),
    [counters, risk, pending, feedStatus, deskStatus, error, system, systemDown, refreshSystem, refresh, epoch, resetView],
  );
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

/** Remounts its children on `resetView`. */
export function ResetBoundary({ children }: { children: ReactNode }) {
  const { epoch } = useDesk();
  return <Fragment key={epoch}>{children}</Fragment>;
}

export function useDesk(): DeskState {
  const ctx = useContext(DeskContext);
  if (!ctx) throw new Error("useDesk must be used inside <DeskStateProvider>");
  return ctx;
}
