"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useNow } from "@/lib/clock";
import { fmtDateLong } from "@/lib/format";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { effectiveStatus, sortQueue } from "@/components/approvals/approvals-logic";
import { useDesk } from "@/components/shell/desk-state";
import { useRole } from "@/components/roles/use-role";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import { crewDayLine, shortName, todayHeadline } from "@/components/story/plain";
import { BigSentence, Kicker } from "@/components/story/ui";
import { decisionClock } from "./decision-clock";
import { DayStrip } from "./day-strip";
import { CalmDay, StoppedDay } from "./day-states";
import { PortfolioLine } from "./portfolio-line";
import { ProposalCard } from "./proposal-card";
import { WaitingList } from "./waiting-list";

/**
 * /bugun: the home screen. One big sentence; the day at a glance (karar saati and the tayfa
 * satırı); the open proposals as a ruled list, each with where it stands in the two signatures;
 * what waits for you; one line about your money. A proposal that arrives while you look is set
 * down in place. The empty day shows the calm sea, the stopped day says what Durdur did.
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

  return (
    <div>
      <header>
        <Kicker>{nowIso === null ? " " : fmtDateLong(nowIso)}</Kicker>
        {error && loading ? (
          <BigSentence focusTarget className="mt-4 animate-fade-in">
            Bugün’ün listesi gelmedi.
          </BigSentence>
        ) : loading ? (
          <Skeleton className="mt-4 h-12 w-3/4 sm:h-14" />
        ) : (
          <BigSentence focusTarget className="mt-4 animate-fade-in">
            {keepDash(todayHeadline(stopped ? 0 : open.length, stopped))}
          </BigSentence>
        )}
      </header>

      {error && loading ? (
        <div className="mt-8">
          <ErrorState message="Panel sunucuya ulaşamadı; öneriler ve portföy yüklenemedi." onRetry={() => void refresh()} />
        </div>
      ) : (
        <>
          <div className="mt-8 sm:mt-10">
            <DayStrip state={state} clock={decisionClock(open, now)} crew={crewDayLine(counters)} halted={Boolean(risk?.halted_today)} />
          </div>

          <div>
            {state === "loading" ? <LoadingRows /> : null}
            {state === "stopped" && risk ? <StoppedDay risk={risk} /> : null}
            {state === "empty" ? <CalmDay /> : null}
            {state === "open" ? (
              <ol aria-label="Bekleyen öneriler" className="animate-fade-in divide-y divide-hairline border-y-[1.5px] border-ink">
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

          <WaitingList className="mt-12" />
          {risk ? <PortfolioLine risk={risk} className="mt-12" /> : null}
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
    <div role="status" aria-label="Öneriler yükleniyor" className="divide-y divide-hairline border-y-[1.5px] border-ink">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3 py-6">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-7 w-9/12" />
          <Skeleton className="h-3.5 w-7/12" />
        </div>
      ))}
    </div>
  );
}
