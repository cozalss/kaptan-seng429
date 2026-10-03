"use client";

import { useMemo } from "react";
import { IS_MOCK } from "@/lib/api/config";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { fmtPct, fmtSignedPct, fmtTry } from "@/lib/format";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { useDesk } from "@/components/shell/desk-state";
import { ErrorState, Skeleton, SkeletonLines } from "@/components/ui/primitives";
import { isMarkable, ticketPhase } from "@/components/tickets/ticket-logic";
import { OrderSlip } from "@/components/proposal/order-slip";
import { BigSentence, Fleuron, Kicker, SampleTag } from "@/components/story/ui";
import { EquityLine, equitySeries } from "./equity-line";
import { Holdings } from "./holdings";
import { istanbulDate } from "./risk-math";
import { StopControl } from "./stop-control";

/** The strategy the desk trades (its closes draw the line; API.md §pnl). */
const LIVE_STRATEGY = "kaptan:v1.1-fwd";

/**
 * /portfoy — your money in one big number, one small line, what you hold, the fişler still
 * waiting for your mark, and Durdur.
 */
export function PortfolioScreen() {
  const { risk } = useDesk();
  const now = useNow(30_000);
  const today = now === null ? null : istanbulDate(now);
  const riskKey = risk ? `${risk.kill_switch}|${risk.reset?.next_step ?? ""}` : "";
  const q = useApiQuery((api) => Promise.all([api.positions(), api.pnl(), api.listTickets()]), [riskKey]);
  useEventStream("desk", { fill: () => void q.refetch(), ticket: () => void q.refetch(), order: () => void q.refetch() });

  const points = useMemo(
    () => (q.data && risk && today ? equitySeries(q.data[1], LIVE_STRATEGY, { d: today, equity: risk.equity }) : []),
    [q.data, risk, today],
  );
  const waiting = (q.data?.[2] ?? []).filter((t) => isMarkable(t) && now !== null && ticketPhase(t, now) !== "expired");

  return (
    <div className="space-y-14">
      <header className="space-y-4">
        <Kicker className="flex items-center gap-3">
          Portföyün {IS_MOCK ? <SampleTag /> : null}
        </Kicker>
        {risk ? (
          <>
            <BigSentence className="tabular-nums">{fmtTry(risk.equity)}</BigSentence>
            <p className="text-[17px] text-ink-soft">
              Bugün <span className="text-ink tabular-nums">{fmtSignedPct(risk.daily_pnl_pct, 2)}</span>
              <span aria-hidden className="mx-2 text-rule-soft">·</span>
              en yüksek noktadan {risk.drawdown_pct < 0 ? <span className="tabular-nums">{fmtPct(risk.drawdown_pct, 1)}</span> : "aşağıda değil"}
            </p>
          </>
        ) : (
          <Skeleton className="h-12 w-2/3" />
        )}
        {points.length > 1 ? (
          <div className="pt-4">
            <EquityLine points={points} />
          </div>
        ) : null}
      </header>

      {q.error && !q.data ? <ErrorState message={q.error} onRetry={q.refetch} /> : null}

      <section aria-labelledby="elindekiler" className="space-y-4">
        <h2 id="elindekiler" className="text-[13px] font-medium tracking-[0.04em] text-ink uppercase">
          Elindekiler
        </h2>
        {q.data && today ? <Holdings positions={q.data[0]} today={today} /> : <SkeletonLines lines={3} />}
      </section>

      {waiting.length ? (
        <section aria-labelledby="fisler" className="space-y-4">
          <h2 id="fisler" className="text-[13px] font-medium tracking-[0.04em] text-ink uppercase">
            Girilecek fişler
          </h2>
          <div className="space-y-6">
            {waiting.map((t) => (
              <OrderSlip key={t.ticket_no} ticket={t} onMarked={() => void q.refetch()} />
            ))}
          </div>
        </section>
      ) : null}

      <Fleuron />

      {risk ? <StopControl risk={risk} /> : null}
    </div>
  );
}
