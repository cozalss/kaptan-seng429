"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ApprovalCard, DayCounters, RiskStatus } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { useEventStream, type StreamStatus } from "@/lib/sse/use-event-stream";
import { fmtInt, fmtPrice } from "@/lib/format";
import { notify } from "@/components/ui/toast";

/**
 * Desk-wide live state for the shell (top bar, banners, palette): today's counters, risk
 * status and pending approvals, kept fresh by /stream/feed and /stream/desk. Screens may
 * read it with `useDesk()` instead of refetching the same things.
 */
export interface DeskState {
  counters: DayCounters | null;
  risk: RiskStatus | null;
  pending: ApprovalCard[];
  feedStatus: StreamStatus;
  deskStatus: StreamStatus;
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

  const refresh = useCallback(async () => {
    try {
      const [c, r, p] = await Promise.all([api.counters(), api.riskStatus(), api.listApprovals("pending")]);
      setCounters(c);
      setRisk(r);
      setPending(p);
    } catch {
      // The shell degrades quietly; screens show their own errors.
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
      // On the queue itself the card arrives in place; a toast would only repeat it.
      if (pathname === "/approvals") return;
      notify.event(`Onay bekliyor: ${card.ticker}`, `${card.event_type} · ${card.headline_tr}`, {
        label: "Aç",
        onClick: () => router.push("/approvals"),
      });
    },
    "approval.decided": (card) => setPending((list) => list.filter((x) => x.proposal_id !== card.proposal_id)),
    fill: (f) => notify.success(`Dolum: ${f.ticker}`, `${fmtInt(f.qty)} lot @ ${fmtPrice(f.price)} (komisyon + kayma dahil)`),
    kill_switch: (r) => {
      setRisk(r);
      // The north-red band (RiskBanner) announces it on every screen; no duplicate toast.
      if (r.kill_switch === "on") setPending([]);
    },
    halt: (r) => setRisk(r),
  });

  const resetView = useCallback(() => {
    setEpoch((n) => n + 1);
    void refresh();
  }, [refresh]);

  const value = useMemo<DeskState>(
    () => ({ counters, risk, pending, feedStatus, deskStatus, refresh, epoch, resetView }),
    [counters, risk, pending, feedStatus, deskStatus, refresh, epoch, resetView],
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
