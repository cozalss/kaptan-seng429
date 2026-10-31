"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { RiskStatus } from "@/lib/domain";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { fmtDateLong, fmtInt } from "@/lib/format";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { effectiveStatus, sortQueue } from "@/components/approvals/approvals-logic";
import { CARD, CardHead } from "@/components/portfolio/kit";
import { EquityLine } from "@/components/portfolio/equity-line";
import { equitySeries } from "@/components/portfolio/equity-math";
import { istanbulDate } from "@/components/portfolio/risk-math";
import { valueOf } from "@/components/settings/limits-logic";
import { useDesk } from "@/components/shell/desk-state";
import { PageHeader } from "@/components/shell/page-frame";
import { useRole } from "@/components/roles/use-role";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import { shortName, todayHeadline } from "@/components/story/plain";
import { AuditFeed } from "./audit-feed";
import { decisionClock } from "./decision-clock";
import { CalmDay, StoppedDay, type CalmFacts } from "./day-states";
import { FlowStrip, type FlowData } from "./flow-strip";
import { RecentDisclosures } from "./recent-disclosures";
import { MAX_DISCLOSURES } from "@/lib/api/limits";
import { dayLabel, sessionView } from "@/lib/session-day";
import { flowFromList } from "@/components/disclosures/disclosure-logic";
import { KpiRow } from "./kpi-row";
import { LimitsUsage } from "./limits-usage";
import { ProposalCard } from "./proposal-card";
import { WaitingList } from "./waiting-list";

/** The strategy the desk trades (its closes draw the value line; API.md §pnl). */
const LIVE_STRATEGY = "kaptan:v1.1-fwd";

/**
 * /bugun: the desk's dashboard. The header says how many proposals wait (and when the soonest
 * closes); a row of six figures; the open proposals as a list with İncele and the value line;
 * beside them what waits for you, how close the stop lines are, how today's disclosures
 * flowed and the newest ledger lines. A proposal that arrives while you look is set down in place.
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
  const session = now === null ? null : sessionView(now, counters?.total ?? null);
  const shownLabel = session ? dayLabel(session.shown) : null;
  const meta = [
    nowIso === null ? null : fmtDateLong(nowIso),
    session?.closed ? "piyasa kapalı" : null,
    session?.previous && shownLabel ? `son seans ${shownLabel}` : null,
    counters && !session?.previous ? `${fmtInt(counters.total)} bildirim okundu` : null,
    clock ? `en yakın son saat ${clock.when}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const book = useDeskBook(risk);
  // The day Bugün talks about: today, or the last session on a weekend / before a quiet open.
  const day = useApiQuery(
    (api) => (session ? api.disclosures({ day: session.shown, limit: MAX_DISCLOSURES }) : Promise.resolve(null)),
    [session?.shown, session?.previous ? 0 : (counters?.total ?? 0)],
  );
  // A past session's exact counters (GET /disclosures/counters?day=); the capped list only
  // stands in when that call fails, and then says "500+".
  const past = useApiQuery(
    (api) => (session?.previous ? api.counters(session.shown) : Promise.resolve(null)),
    [session?.previous ? session.shown : null],
  );
  const flow: FlowData | null = session?.previous ? (past.data ?? (past.error && day.data ? flowFromList(day.data) : null)) : counters;
  const flowNote = session?.previous && shownLabel ? `Son seans: ${shownLabel}` : "Bugün KAP’ta yayımlananlar";
  const calm: CalmFacts | null = flow
    ? {
        read: flow.total,
        capped: flow.capped ?? false,
        toCrew: flow.processed,
        candidates: flow.e_candidates,
        when: session?.previous && shownLabel ? shownLabel : "bugün",
        nextSession: session?.closed ? dayLabel(session.next) : null,
      }
    : null;
  const unreachable = error !== null && loading;
  const title: ReactNode = unreachable
    ? "Bugün’ün listesi gelmedi."
    : loading
      ? <Skeleton className="h-10 w-72 max-w-full" />
      : keepDash(todayHeadline(stopped ? 0 : open.length, stopped));

  return (
    <div>
      <PageHeader title={title} lead={<p className="min-h-6 tabular-nums">{meta}</p>} />

      {unreachable ? (
        <ErrorState message="Panel sunucuya ulaşamadı; öneriler ve portföy yüklenemedi." onRetry={() => void refresh()} />
      ) : (
        <div className="space-y-4 xl:space-y-5">
          <KpiRow
            risk={risk}
            cash={book.cash}
            positions={book.positions}
            maxPositions={book.limits ? valueOf(book.limits, "max_concurrent_positions") : null}
            pending={stopped ? 0 : open.length}
            soonest={clock?.when ?? null}
            trend={book.trend}
          />

          <FlowStrip data={flow} note={flowNote} />

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-5">
            <div className="min-w-0 space-y-4 xl:space-y-5">
              <section aria-labelledby="bekleyen-oneriler" className={CARD}>
                <CardHead
                  id="bekleyen-oneriler"
                  title={
                    <span className="inline-flex items-center gap-2.5">
                      Bekleyen öneriler
                      {state === "open" ? (
                        <span className="rounded-full bg-brand px-2 text-meta leading-[22px] font-semibold text-on-dark tabular-nums">{open.length}</span>
                      ) : null}
                    </span>
                  }
                  note={role === "risk_officer" ? "İkinci imza senin: incele, onayla ya da reddet." : "İkinci imzayı Risk Sorumlusu atar."}
                />
                {state === "loading" ? <LoadingRows /> : null}
                {state === "stopped" && risk ? <StoppedDay risk={risk} /> : null}
                {state === "empty" ? <CalmDay facts={calm} /> : null}
                {state === "open" ? (
                  <ol aria-label="Bekleyen öneriler" className="animate-fade-in divide-y divide-line border-t border-line">
                    {open.map((c) => (
                      <li key={c.proposal_id}>
                        <ProposalCard card={c} fresh={fresh.has(c.proposal_id)} nowIso={nowIso} yours={role === "risk_officer"} />
                      </li>
                    ))}
                  </ol>
                ) : null}
              </section>
              <EquityLine points={book.points} peak={risk?.peak_equity ?? null} title="Portföy değeri" />
              <RecentDisclosures rows={day.data ?? null} total={flow && !flow.capped ? flow.total : null} error={day.error} onRetry={day.refetch} note={flowNote} />
            </div>

            <div className="min-w-0 space-y-4 xl:space-y-5">
              <WaitingList />
              <LimitsUsage risk={risk} values={book.limits} openPositions={book.positions ?? null} />
              <AuditFeed />
            </div>
          </div>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {arrived ? `Yeni öneri geldi: ${shortName(arrived.company_name)}` : ""}
      </p>
    </div>
  );
}

/**
 * What the dashboard reads beside the desk state: open positions, cash, the active limits and
 * the value line. Each part fails on its own (its tile says "—"), so one slow call never blanks Bugün.
 */
function useDeskBook(risk: RiskStatus | null) {
  const now = useNow(60_000);
  const today = now === null ? null : istanbulDate(now);
  const kill = risk?.kill_switch;
  const positions = useApiQuery((api) => api.positions(), [kill]);
  const overview = useApiQuery((api) => api.overview(), [kill]);
  const limits = useApiQuery((api) => api.limits(), []);
  const pnl = useApiQuery((api) => api.pnl(), [kill]);
  useEventStream("desk", {
    fill: () => void positions.refetch(),
    ticket: () => void positions.refetch(),
    "limits.changed": () => void limits.refetch(),
  });
  const points = useMemo(
    () => (pnl.data && risk && today ? equitySeries(pnl.data, LIVE_STRATEGY, { d: today, equity: risk.equity }) : []),
    [pnl.data, risk, today],
  );
  const trend = useMemo(() => points.map((p) => p.equity), [points]);
  return {
    trend,
    positions: positions.data ? positions.data.length : positions.error ? null : undefined,
    cash: overview.data ? overview.data.cash : overview.error ? null : undefined,
    limits: limits.data?.active.values,
    points,
  };
}

/**
 * "Bugün öneri yok — tayfa izliyor.": the dash keeps to the word before it, so a balanced
 * break never starts a line with "—". Plain strings without a dash pass through.
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
    <div role="status" aria-label="Öneriler yükleniyor" className="divide-y divide-line border-t border-line">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3 px-5 py-5">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-4 w-9/12" />
          <Skeleton className="h-3.5 w-7/12" />
        </div>
      ))}
    </div>
  );
}
