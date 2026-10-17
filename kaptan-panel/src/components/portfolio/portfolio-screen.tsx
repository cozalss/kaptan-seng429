"use client";

import { useMemo } from "react";
import { IS_MOCK } from "@/lib/api/config";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { useDesk } from "@/components/shell/desk-state";
import { ErrorState, SkeletonLines } from "@/components/ui/primitives";
import { slipsToEnter } from "@/components/tickets/ticket-logic";
import { OrderSlip } from "@/components/proposal/order-slip";
import { Kicker, SampleTag } from "@/components/story/ui";
import { EquityLine } from "./equity-line";
import { equitySeries, seriesChange } from "./equity-math";
import { Holdings } from "./holdings";
import { PortfolioHero } from "./portfolio-hero";
import { istanbulDate } from "./risk-math";
import { StopControl } from "./stop-control";

/** The strategy the desk trades (its closes draw the line; API.md §pnl). */
const LIVE_STRATEGY = "kaptan:v1.1-fwd";

/**
 * /portfoy — the money in one big number, one small line, what is held, the fişler still
 * waiting for a mark, and Durdur (stop: one person; restart: two).
 */
export function PortfolioScreen() {
  const { risk, error: deskError, refresh } = useDesk();
  const now = useNow(30_000);
  const today = now === null ? null : istanbulDate(now);
  const riskKey = risk ? `${risk.kill_switch}|${risk.reset?.started?.at ?? ""}` : "";
  const q = useApiQuery((api) => Promise.all([api.positions(), api.pnl(), api.listTickets(), api.listApprovals("all")]), [riskKey]);
  useEventStream("desk", { fill: () => void q.refetch(), ticket: () => void q.refetch(), order: () => void q.refetch() });

  const points = useMemo(
    () => (q.data && risk && today ? equitySeries(q.data[1], LIVE_STRATEGY, { d: today, equity: risk.equity }) : []),
    [q.data, risk, today],
  );
  /** proposal id → when it was signed, for "11 Ocak’ta imzalandı". */
  const signedAt = useMemo(
    () => Object.fromEntries((q.data?.[3] ?? []).flatMap((a) => (a.decided_at ? [[a.proposal_id, a.decided_at] as const] : []))),
    [q.data],
  );
  const waiting = slipsToEnter(q.data?.[2], now);
  const unreachable = deskError !== null && risk === null;
  const stopped = risk?.kill_switch === "on";

  return (
    <div className="space-y-14">
      <header className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Kicker className="flex items-center gap-3">
            Portföyün {IS_MOCK ? <SampleTag /> : null}
          </Kicker>
          {stopped ? (
            <a href="#durdur" className="inline-flex min-h-6 items-center text-dense font-medium text-north max-sm:min-h-11 underline decoration-north/40 underline-offset-4 hover:decoration-north">
              Durduruldu · yeniden başlatma aşağıda ↓
            </a>
          ) : null}
        </div>
        {unreachable ? (
          <ErrorState message="Panel sunucuya ulaşamadı; öneriler ve portföy yüklenemedi." onRetry={() => void refresh()} />
        ) : (
          <PortfolioHero risk={risk} change={seriesChange(points)} />
        )}
        <div className="pt-8">
          <EquityLine points={points} peak={risk?.peak_equity ?? null} />
        </div>
      </header>


      {q.error && !q.data ? <ErrorState message={q.error} onRetry={q.refetch} /> : null}

      <section aria-labelledby="elindekiler" className="space-y-4">
        <div className="space-y-1.5">
          <h2 id="elindekiler" className="label">
            Elindekiler
          </h2>
          <p className="max-w-[560px] text-ui text-ink-soft">Bunlar KAPtan hesabındaki pozisyonlar; fişleri aracı kuruma sen girersin.</p>
        </div>
        {q.data && today ? <Holdings positions={q.data[0]} today={today} signedAt={signedAt} /> : <SkeletonLines lines={3} />}
      </section>

      {waiting.length ? (
        <section aria-labelledby="fisler" className="space-y-4">
          <div className="space-y-1.5">
            <h2 id="fisler" className="label">
              Girilecek fişler
            </h2>
            <p className="max-w-[560px] text-ui text-ink-soft">İmzalanmış ama aracı kurumda henüz girilmemiş emirler; girince “Girdim”e bas.</p>
          </div>
          <div className="space-y-6">
            {waiting.map((t) => (
              <OrderSlip key={t.ticket_no} ticket={t} onMarked={() => void q.refetch()} />
            ))}
          </div>
        </section>
      ) : null}

      {/* One fixed place, so a stop or restart never remounts it mid-dialog. */}
      <div className="pt-[var(--space-chapter)]">{risk ? <StopControl risk={risk} /> : null}</div>
    </div>
  );
}
