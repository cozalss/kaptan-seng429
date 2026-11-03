"use client";

import "./portfolio.css";

import { useApiQuery } from "@/lib/api/react";
import { MSG_UNREACHABLE } from "@/lib/api/types";
import { useNow } from "@/lib/clock";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { fmtLira, fmtSignedLira } from "@/lib/solo/words";
import { Band, PageHeader, ScreenState } from "@/components/shell/page-frame";
import { useDesk } from "@/components/shell/desk-state";
import { StopCard, StoppedBanner, useStopRestart } from "@/components/solo/stop-panel";
import { signTone } from "@/components/story/sign-tone";
import { OrderSlip } from "@/components/proposal/order-slip";
import { slipsToEnter } from "@/components/tickets/ticket-logic";
import { fmtSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Guards } from "./guards";
import { Holdings } from "./holdings";
import { placesSentence, todayLira } from "./param-words";
import { istanbulDate } from "./risk-math";
import { Skyline } from "./skyline";

/**
 * /portfoy ("Param"): what do I own, what is each worth, what did I pay, am I up or down. The
 * sentence first, then the waiting orders (they run out), the money above and under the water,
 * every holding as something to read, and what protects it all.
 */
export function PortfolioScreen() {
  const { risk, error: deskError, refresh } = useDesk();
  const now = useNow(30_000);
  const today = now === null ? null : istanbulDate(now);
  const riskKey = risk ? `${risk.kill_switch}|${risk.reset?.started?.at ?? ""}` : "";
  const q = useApiQuery((api) => Promise.all([api.positions(), api.listTickets()]), [riskKey]);
  // The cash comes from the home's call, the brakes from the limits: without them their sentences are dropped.
  const money = useApiQuery((api) => api.overview(), [riskKey]);
  const limits = useApiQuery((api) => api.limits(), []);
  useEventStream("desk", {
    fill: () => {
      void q.refetch();
      void money.refetch();
    },
    ticket: () => void q.refetch(),
    order: () => void q.refetch(),
    "limits.changed": () => void limits.refetch(),
  });

  const positions = q.data?.[0];
  const waiting = slipsToEnter(q.data?.[1], now);
  const cash = money.data?.cash ?? null;
  const stopped = risk?.kill_switch === "on";
  const controls = useStopRestart(refresh);
  const unreachable = deskError !== null && risk === null;

  const sentence = positions && (money.data || money.error) ? placesSentence(new Set(positions.map((p) => p.ticker)).size, cash) : "Paranı sayıyorum…";

  return (
    <div className="pm-screen">
      <PageHeader name="Param" title={sentence} />

      {stopped && risk ? <StoppedBanner risk={risk} pending={controls.restartPending} error={controls.restartError} onRestart={controls.onRestart} /> : null}

      {unreachable ? <ScreenState kind="error" title={MSG_UNREACHABLE} onRetry={() => void refresh()}>Paran yerinde; yalnızca şu an göremiyorum. Birkaç saniye sonra yeniden dene.</ScreenState> : null}

      {risk ? <Figures equity={risk.equity} today={todayLira(risk)} todayPct={risk.daily_pnl_pct} since={money.data?.pnl_abs ?? null} sincePct={money.data?.pnl_pct ?? null} /> : null}

      {waiting.length ? (
        <Band aria-labelledby="fisler" className="pm-slips">
          <h2 id="fisler" className="u-chapter text-ink">
            Bankana gireceklerin ({waiting.length})
          </h2>
          <p className="mt-2 max-w-[60ch] text-body text-ink-soft">Onayladın ama henüz bankanda girmedin. KAPtan senin yerine işlem yapmaz. Bankana girince “Girdim”e bas; süresi dolarsa işlem geçersiz olur.</p>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            {waiting.map((t) => (
              <OrderSlip key={t.ticket_no} ticket={t} onMarked={() => void q.refetch()} />
            ))}
          </div>
        </Band>
      ) : null}

      {q.error && !q.data ? <ScreenState kind="error" title="Elindekileri getiremedim." onRetry={q.refetch}>{q.error}</ScreenState> : null}

      {positions && today ? (
        <>
          <Skyline positions={positions} cash={cash ?? 0} />
          <Holdings positions={positions} today={today} />
        </>
      ) : !q.error ? (
        <ScreenState kind="loading" title="Elindekilere bakıyorum…">
          Birazdan her şirketin bugün ne ettiğini göreceksin.
        </ScreenState>
      ) : null}

      <Band aria-label="Seni koruyan şeyler" className="pm-protect">
        <Guards risk={risk} limits={limits.data ?? null} />
        {risk && !stopped ? <StopCard pending={controls.stopPending} error={controls.stopError} onStop={controls.onStop} /> : null}
      </Band>
    </div>
  );
}

/** The figures under the sentence: scale first, each one says what it is. */
function Figures({ equity, today, todayPct, since, sincePct }: { equity: number; today: number; todayPct: number; since: number | null; sincePct: number | null }) {
  return (
    <dl className="pm-figures" aria-label="Paranın özeti">
      <div className="pm-figure-main">
        <dt className="u-caption">Hepsi birlikte</dt>
        <dd className="pm-total">{fmtLira(equity)}</dd>
      </div>
      <div>
        <dt className="u-caption">Bugün</dt>
        <dd className={cn("pm-figure", signTone(today))}>
          {fmtSignedLira(today)} <span className="pm-figure-pct">{fmtSignedPct(todayPct, 2)}</span>
        </dd>
      </div>
      {since !== null && sincePct !== null ? (
        <div>
          <dt className="u-caption">Başladığından beri</dt>
          <dd className={cn("pm-figure", signTone(since))}>
            {fmtSignedLira(since)} <span className="pm-figure-pct">{fmtSignedPct(sincePct)}</span>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
