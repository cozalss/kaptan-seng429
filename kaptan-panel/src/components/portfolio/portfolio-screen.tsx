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
import { SampleTag } from "@/components/story/ui";
import { EquityLine } from "./equity-line";
import { equitySeries } from "./equity-math";
import { Holdings } from "./holdings";
import { CARD, PageTitle, SectionTitle } from "./kit";
import { PortfolioHero } from "./portfolio-hero";
import { istanbulDate } from "./risk-math";
import { StopControl } from "./stop-control";

/** The strategy the desk trades (its closes draw the line; API.md §pnl). */
const LIVE_STRATEGY = "kaptan:v1.1-fwd";

/**
 * /portfoy — three numbers (total, today, from the peak), the value line, what is held, the
 * fişler still waiting to be entered, and Durdur (stop: one person; restart: two).
 */
export function PortfolioScreen() {
  const { risk, error: deskError, refresh } = useDesk();
  const now = useNow(30_000);
  const today = now === null ? null : istanbulDate(now);
  const riskKey = risk
    ? `${risk.kill_switch}|${risk.reset?.started?.at ?? ""}`
    : "";
  const q = useApiQuery(
    (api) => Promise.all([api.positions(), api.pnl(), api.listTickets()]),
    [riskKey],
  );
  useEventStream("desk", {
    fill: () => void q.refetch(),
    ticket: () => void q.refetch(),
    order: () => void q.refetch(),
  });

  const points = useMemo(
    () =>
      q.data && risk && today
        ? equitySeries(q.data[1], LIVE_STRATEGY, {
            d: today,
            equity: risk.equity,
          })
        : [],
    [q.data, risk, today],
  );
  const waiting = slipsToEnter(q.data?.[2], now);
  const unreachable = deskError !== null && risk === null;
  const stopped = risk?.kill_switch === "on";

  return (
    <div className="flex flex-col gap-8">
      <div className="order-[-2]">
        <PageTitle aside={IS_MOCK ? <SampleTag /> : null}>Portföy</PageTitle>
      </div>

      {unreachable ? (
        <ErrorState
          message="Panel sunucuya ulaşamadı; öneriler ve portföy yüklenemedi."
          onRetry={() => void refresh()}
        />
      ) : (
        <PortfolioHero risk={risk} />
      )}
      <EquityLine points={points} peak={risk?.peak_equity ?? null} />

      {q.error && !q.data ? (
        <ErrorState message={q.error} onRetry={q.refetch} />
      ) : null}

      <section aria-labelledby="elindekiler" className={CARD}>
        <SectionTitle
          id="elindekiler"
          title="Elindekiler"
          className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5"
        >
          Fişleri aracı kuruma sen girersin; satırdaki şirket öneriyi açar.
        </SectionTitle>
        {q.data && today ? (
          <Holdings positions={q.data[0]} today={today} />
        ) : (
          <SkeletonLines lines={3} className="px-4 pb-5 sm:px-6" />
        )}
      </section>

      {waiting.length ? (
        <section aria-labelledby="fisler" className="space-y-4">
          <SectionTitle
            id="fisler"
            title={`Girilecek fişler (${waiting.length})`}
          >
            İmzalandı, aracı kurumda henüz girilmedi. Girince “Girdim”e bas.
          </SectionTitle>
          <div className="space-y-6">
            {waiting.map((t) => (
              <OrderSlip
                key={t.ticket_no}
                ticket={t}
                onMarked={() => void q.refetch()}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* One fixed place in the tree, so a stop or restart never remounts it mid-dialog; while
          stopped it is moved (visually) right under the title, where the next step is. */}
      {risk ? (
        <div className={stopped ? "order-[-1]" : "order-1"}>
          <StopControl risk={risk} />
        </div>
      ) : null}
    </div>
  );
}
