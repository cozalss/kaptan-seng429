"use client";

import "@/components/home/home.css";

import { useCallback, useMemo, useState } from "react";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { istanbulDay } from "@/lib/session-day";
import { homeSeries } from "@/lib/solo/flows";
import { useHolds } from "@/lib/solo/holds";
import { titleTr } from "@/lib/solo/words";
import { stripItems } from "@/lib/signal/signal";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { realName, useSession } from "@/lib/auth/session-context";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import { useDecisions } from "@/components/proposal/use-decisions";
import { splitDecisions } from "@/components/proposal/decide-logic";
import { CorporatePrompt } from "./corporate-prompt";
import { FirstRun } from "./first-run";
import { MorningBrief } from "./morning-brief";
import { PauseNotice } from "./pause-notice";
import { Suggestions, type OrderFigures } from "./suggestions";
import { SignalStrip } from "@/components/signal/signal-strip";
import { BlockHead } from "@/components/home/block-head";
import { DayLearned } from "@/components/home/day-learned";
import { HomeHighlights } from "@/components/home/home-highlights";
import { HomeLinks } from "@/components/home/home-links";
import { HomeSuggested } from "@/components/home/home-suggested";
import { MoneyCard } from "@/components/home/money-card";
import { TodayHeader } from "@/components/home/today-header";
import { todayWords } from "@/components/home/today-words";

/** On the home, at most this many of each list; the rest are one link away. */
const HOME_LIST_MAX = 3;

/**
 * The home answers three questions, in this order, and nothing else: is anything happening with my
 * stocks and must I decide (the header's sentence, then the decisions and my companies' news), how is
 * my money (the card on the ink sea), what else is notable (the day's highlights). Everything else
 * (the money's whole line, where it sits, the log, the calendar, the market, the watchlist) lives on
 * its own page, one quiet link away.
 */
export function SoloHome() {
  const q = useApiQuery(async (api) => {
    // Today's reading counts only colour the empty state: when they fail, the home still opens.
    const [overview, risk, approvals, positions, counters, book, signals] = await Promise.all([
      api.overview(),
      api.riskStatus(),
      api.listApprovals("all"),
      api.positions(),
      api.counters().catch(() => null),
      // The movements only shape the line (a deposit is not a gain): without them it is drawn as before.
      api.money().catch(() => null),
      // Only the header's count: the strip asks again and keeps it live.
      Promise.resolve()
        .then(() => api.signals())
        .catch(() => null),
    ]);
    return { overview, risk, approvals, positions, counters, movements: book?.movements ?? null, mineAtLoad: signals ? stripItems(signals).length : null };
  });
  const session = useSession();
  const { holds, addHold } = useHolds();
  const decisions = useDecisions({ refresh: q.refetch, addHold });
  // A live change (a new suggestion, or a fill) refreshes the screen by itself.
  useEventStream("desk", {
    "approval.requested": () => void q.refetch(),
    "approval.decided": () => void q.refetch(),
    fill: () => void q.refetch(),
  });

  const data = q.data;
  const names = useMemo(
    () =>
      new Map([
        ...(data?.approvals ?? []).map((c) => [c.ticker, titleTr(c.company_name)] as const),
        ...(data?.overview.allocations ?? []).map((a) => [a.symbol, titleTr(a.name)] as const),
      ]),
    [data],
  );
  const held = useMemo(() => new Map((data?.overview.allocations ?? []).map((a) => [a.symbol, a.amount])), [data]);
  const figures = useMemo(
    () => new Map<string, OrderFigures>((data?.approvals ?? []).map((c) => [c.proposal_id, { amount: c.final_notional_try, qty: c.qty, limit: c.limit_price }])),
    [data],
  );
  const suggestions = useMemo(() => {
    const done = new Set(holds.map((h) => h.id));
    return (data?.overview.open_suggestions ?? []).filter((s) => !done.has(s.id));
  }, [data, holds]);
  const now = useNow(60_000);
  const today = now === null ? null : istanbulDay(now);
  // The line is each day's gain over the money put in by then, so adding money leaves no step in it.
  const overview = useMemo(() => {
    const o = data?.overview;
    if (!o || o.needs_setup) return o;
    return { ...o, equity_series: homeSeries(o.equity_series, data.movements, today, o.equity_now, o.capital_start) };
  }, [data, today]);
  const [mineLive, setMineLive] = useState<number | null>(null);
  const onMine = useCallback((n: number) => setMineLive(n), []);

  if (q.loading && !data) return <HomeSkeleton />;
  if (!data || !overview) return <ErrorState message={q.error ?? "Bilgiler alınamadı."} onRetry={() => void q.refetch()} />;
  // A new install: one question first, then everything below.
  if (data.overview.needs_setup) return <FirstRun onDone={() => void q.refetch()} />;
  // Buy and sell proposals still open now (a "tut" is a question about a holding, not a proposal): the morning
  // brief's count is a picture of 08:45, this is the live one under it.
  const { front, queue } = splitDecisions(suggestions, decisions.state);
  const open = [front, ...queue].filter((x) => x !== null);
  const proposalsNow = open.filter((x) => x.action !== "tut").length;
  const steps = decisions.steps.filter((t) => t.entry.status === "awaiting").length;
  const started = overview.equity_series.length >= 2 || overview.allocations.length > 0;
  const words = todayWords({ started, decisions: open.length, holds: open.length - proposalsNow, steps, mine: mineLive ?? data.mineAtLoad });

  const hasDecisions = open.length > 0 || decisions.steps.length > 0 || decisions.state.flights.length > 0;
  const mine = mineLive ?? data.mineAtLoad;

  return (
    <>
      <PauseNotice />
      <div className="hm u-page">
        {q.error ? <ErrorState message={q.error} onRetry={() => void q.refetch()} /> : null}
        <div className="hm-layout">
          <div className="hm-lead">
            <TodayHeader name={realName(session.name)} words={words} brief={<MorningBrief proposalsNow={proposalsNow} collapsible />} />
          </div>
          <div className="hm-side">
            <MoneyCard overview={overview} todayPct={data.risk.daily_pnl_pct} />
            <div className="hm-links-wide">
              <HomeLinks />
            </div>
          </div>
          <div className="hm-main">
            {hasDecisions ? (
              <div className="hm-block">
                <BlockHead id="kararlarin" label="Kararların" about="KAPtan’ın önerileri; sen onaylamadıkça hiçbir şey olmaz." />
                <Suggestions
                  suggestions={suggestions}
                  names={names}
                  figures={figures}
                  held={held}
                  today={data.counters ? { read: data.counters.total, toCrew: data.counters.processed } : null}
                  decisions={decisions}
                  headless
                />
              </div>
            ) : null}
            <HomeSuggested />
            <CorporatePrompt onChanged={() => void q.refetch()} />
            <SignalStrip limit={HOME_LIST_MAX} compact onMine={onMine} />
            <DayLearned mine={mine} />
            <HomeHighlights />
            <div className="hm-links-narrow">
              <HomeLinks />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function HomeSkeleton() {
  return (
    <div role="status" aria-label="Yükleniyor" className="hm u-page">
      <div className="hm-layout">
        <div className="hm-lead">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="mt-6 h-12 w-4/5" />
          <Skeleton className="mt-4 h-5 w-3/5" />
        </div>
        <div className="hm-side">
          <div aria-hidden className="hm-money hm-money--ghost" />
        </div>
      </div>
    </div>
  );
}
