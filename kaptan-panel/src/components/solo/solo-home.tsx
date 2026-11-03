"use client";

import { useMemo } from "react";
import { useApiQuery } from "@/lib/api/react";
import { recentActivity } from "@/lib/solo/activity";
import { useHolds } from "@/lib/solo/holds";
import { titleTr } from "@/lib/solo/words";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { realName, useSession } from "@/lib/auth/session-context";
import { useDesk } from "@/components/shell/desk-state";
import { Sea } from "@/components/ufuk/sea";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import { useDecisions } from "@/components/proposal/use-decisions";
import { Activity } from "./activity";
import { AllocationPanel } from "./allocation";
import { MoneyHero } from "./money-hero";
import { ConfirmAction, StoppedBanner, useStopRestart } from "./stop-panel";
import { Suggestions, type OrderFigures } from "./suggestions";

/**
 * The home, one calm scene for one person, in reading order on every screen: the money and how it
 * moved (the horizon), what to decide (laid over its sea), where the money sits, what happened
 * lately, and the stop.
 */
export function SoloHome() {
  const q = useApiQuery(async (api) => {
    // Today's reading counts only colour the empty state: when they fail, the home still opens.
    const [overview, risk, approvals, positions, counters] = await Promise.all([
      api.overview(),
      api.riskStatus(),
      api.listApprovals("all"),
      api.positions(),
      api.counters().catch(() => null),
    ]);
    return { overview, risk, approvals, positions, counters };
  });
  const desk = useDesk();
  const session = useSession();
  const { holds, addHold } = useHolds();
  const decisions = useDecisions({ refresh: q.refetch, addHold });
  // A live change (a new suggestion, a fill, a stop) refreshes the screen by itself.
  useEventStream("desk", {
    "approval.requested": () => void q.refetch(),
    "approval.decided": () => void q.refetch(),
    fill: () => void q.refetch(),
    kill_switch: () => void q.refetch(),
  });
  const controls = useStopRestart(() => Promise.all([q.refetch(), desk.refresh()]));

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
  const activity = useMemo(() => (data ? recentActivity(data.approvals, data.positions, holds) : []), [data, holds]);

  if (q.loading && !data) return <HomeSkeleton />;
  if (!data) return <ErrorState message={q.error ?? "Bilgiler alınamadı."} onRetry={() => void q.refetch()} />;

  const stopped = data.risk.kill_switch === "on";

  return (
    <>
      {q.error || stopped ? (
        <div className="u-page mb-4 space-y-3">
          {q.error ? <ErrorState message={q.error} onRetry={() => void q.refetch()} /> : null}
          {stopped ? <StoppedBanner risk={data.risk} pending={controls.restartPending} error={controls.restartError} onRestart={controls.onRestart} /> : null}
        </div>
      ) : null}
      <MoneyHero overview={data.overview} todayPct={data.risk.daily_pnl_pct} positions={data.positions} name={realName(session.name)} />
      <div className="home-sheet u-page">
        <Suggestions
          suggestions={suggestions}
          names={names}
          figures={figures}
          held={held}
          stopped={stopped}
          halted={data.risk.halted_today}
          today={data.counters ? { read: data.counters.total, toCrew: data.counters.processed } : null}
          decisions={decisions}
        />
      </div>
      <div className="home-band u-page">
        <AllocationPanel allocations={data.overview.allocations} cash={data.overview.cash} total={data.overview.equity_now} />
      </div>
      <div className="home-band u-page !pt-0">
        <Activity items={activity} />
      </div>
      {stopped ? null : <StopBand pending={controls.stopPending} error={controls.stopError} onStop={controls.onStop} />}
    </>
  );
}

/** The page closes on the water, where the stop stays findable and quiet. */
function StopBand({ pending, error, onStop }: { pending: boolean; error: string | null; onStop: () => Promise<boolean> }) {
  return (
    <section aria-labelledby="acil-durum" className="home-close">
      <Sea className="absolute inset-0" />
      <div className="u-page relative flex flex-wrap items-center justify-between gap-x-10 gap-y-4 py-8 sm:py-10">
        <div className="max-w-[56ch]">
          <h2 id="acil-durum" className="text-body font-semibold text-on-sea">
            Acil durum
          </h2>
          <p className="mt-1 text-ui text-on-sea-soft">Bir şey ters gidiyorsa her şeyi tek tuşla durdur. Elindeki hisseler satılmaz.</p>
        </div>
        <ConfirmAction
          trigger={
            <Button variant="danger-outline" size="md" className="max-sm:w-full">
              Tüm işlemleri durdur
            </Button>
          }
          title="Tüm işlemler durdurulsun mu?"
          description="Yeni alım ve satım yapılmaz, bekleyen işlemler iptal edilir. Elindeki hisseler satılmaz."
          confirm="Evet, durdur"
          busy="Durduruluyor…"
          tone="critical"
          pending={pending}
          error={error}
          onConfirm={onStop}
        />
      </div>
    </section>
  );
}

/** The scene's own shape while it loads, so nothing jumps when the money arrives. */
function HomeSkeleton() {
  return (
    <div role="status" aria-label="Yükleniyor">
      <div className="hz-head u-page">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="u-sentence u-sentence--hero mt-5 h-[1.96em] w-4/5" />
        <Skeleton className="mt-6 h-[78px] w-[28rem] max-w-full" />
      </div>
      <div className="hz-plot" />
      <div aria-hidden className="u-sea h-64" />
    </div>
  );
}
