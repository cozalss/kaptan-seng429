"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useNow } from "@/lib/clock";
import { fmtDateLong, fmtInt } from "@/lib/format";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { effectiveStatus, sortQueue } from "@/components/approvals/approvals-logic";
import { useDesk } from "@/components/shell/desk-state";
import { useRole } from "@/components/roles/use-role";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import { shortName, todayHeadline } from "@/components/story/plain";
import { BigSentence } from "@/components/story/ui";
import { decisionClock } from "./decision-clock";
import { CalmDay, StoppedDay } from "./day-states";
import { PortfolioLine } from "./portfolio-line";
import { ProposalCard } from "./proposal-card";
import { WaitingList } from "./waiting-list";

/**
 * /bugun: the home screen. One title and one meta line (date, notices read, the soonest
 * deadline); the open proposals as one list of clean rows (company, one-line summary, amount,
 * deadline, signature status); what waits for you; one compact portfolio summary. A proposal
 * that arrives while you look is set down in place.
 */
export function TodayScreen() {
  const { pending, risk, counters, error, refresh } = useDesk();
  const { role } = useRole();
  const now = useNow(30_000);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  useEventStream("desk", {
    "approval.requested": (card) => setFresh((s) => new Set(s).add(card.proposal_id)),
  });

  const open = useMemo(() => sortQueue(pending, now).filter((c) => effectiveStatus(c, now) === "pending"), [pending, now]);
  const nowIso = now === null ? null : new Date(now).toISOString();
  const stopped = risk?.kill_switch === "on";
  const loading = risk === null;
  const arrived = open.find((c) => fresh.has(c.proposal_id));
  const state = loading ? "loading" : stopped ? "stopped" : open.length ? "open" : "empty";
  const clock = state === "open" ? decisionClock(open, now) : null;
  const meta = [
    nowIso === null ? null : fmtDateLong(nowIso),
    counters ? `${fmtInt(counters.total)} bildirim okundu` : null,
    clock ? `en yakın son saat ${clock.when}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <header>
        {error && loading ? (
          <BigSentence focusTarget className="animate-fade-in">
            Bugün’ün listesi gelmedi.
          </BigSentence>
        ) : loading ? (
          <Skeleton className="h-10 w-3/4" />
        ) : (
          <BigSentence focusTarget className="animate-fade-in">
            {keepDash(todayHeadline(stopped ? 0 : open.length, stopped))}
          </BigSentence>
        )}
        <p className="mt-3 min-h-6 text-ui text-ink-soft tabular-nums">{meta}</p>
      </header>

      {error && loading ? (
        <div className="mt-8">
          <ErrorState message="Panel sunucuya ulaşamadı; öneriler ve portföy yüklenemedi." onRetry={() => void refresh()} />
        </div>
      ) : (
        <>
          <div className="mt-8">
            {state === "loading" ? <LoadingRows /> : null}
            {state === "stopped" && risk ? <StoppedDay risk={risk} /> : null}
            {state === "empty" ? <CalmDay /> : null}
            {state === "open" ? (
              <ol aria-label="Bekleyen öneriler" className="animate-fade-in divide-y divide-hairline border-2 border-ink bg-panel">
                {open.map((c) => (
                  <li key={c.proposal_id}>
                    <ProposalCard card={c} fresh={fresh.has(c.proposal_id)} nowIso={nowIso} yours={role === "risk_officer"} />
                  </li>
                ))}
              </ol>
            ) : null}
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {arrived ? `Yeni öneri geldi: ${shortName(arrived.company_name)}` : ""}
          </p>

          <WaitingList className="mt-8" />
          {risk ? <PortfolioLine risk={risk} className="mt-8" /> : null}
        </>
      )}
    </div>
  );
}

/**
 * "Bugün öneri yok — tayfa izliyor.": the dash keeps to the word before it, so a balanced
 * break never starts a line with "—". Plain strings without a dash pass through (and keep
 * their tabular figures in BigSentence).
 */
function keepDash(text: string): ReactNode {
  const [head, tail] = text.split(" — ");
  if (tail === undefined || head === undefined) return text;
  const cut = head.lastIndexOf(" ") + 1;
  return (
    <>
      {head.slice(0, cut)}
      <span className="whitespace-nowrap">{head.slice(cut)} —</span> {tail}
    </>
  );
}

/** Two quiet rows in the list's own rhythm while the desk loads (they show only after 280ms). */
function LoadingRows() {
  return (
    <div role="status" aria-label="Öneriler yükleniyor" className="divide-y divide-hairline border-2 border-ink bg-panel">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3 px-4 py-5 sm:px-6">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-4 w-9/12" />
          <Skeleton className="h-3.5 w-7/12" />
        </div>
      ))}
    </div>
  );
}
