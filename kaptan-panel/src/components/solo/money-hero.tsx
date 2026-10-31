"use client";

import { useMemo, useState } from "react";
import { fmtPct, fmtSignedPct } from "@/lib/format";
import type { EquityPoint, Overview } from "@/lib/solo/overview";
import { filterPeriod, PERIOD_LABEL, PERIODS, periodIsDistinct, type Period } from "@/lib/solo/period";
import { dayLabel, fmtLira, fmtSignedLira, liraParts } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { Figure } from "@/components/ui/figure";
import { HeroPlot } from "./hero-plot";

/** Few days, or the money has not moved yet: a short plot and a promise instead of a flat box. */
export function isFlat(points: readonly EquityPoint[]): boolean {
  return points.length < 3 || new Set(points.map((p) => Math.round(p.equity))).size < 2;
}

/** Today's move in ₺ from the day's % on the total (what the desk calls "Bugünkü getiri"). */
export function todayAmount(equityNow: number, pct: number): number {
  return pct <= -1 ? 0 : equityNow - equityNow / (1 + pct);
}

const UP_DOWN = (n: number) => (Math.round(n) > 0 ? "solo-up" : Math.round(n) < 0 ? "solo-down" : "text-on-navy-soft");

/**
 * The thesis of /benim, on the desk's navy: how much money there is, set large, with today's
 * move in a chip under it, and the line of how it got here right below. Pointing at the line
 * scrubs the big figure to that day (and the chip to the change since the period began). The
 * footer carries the three facts a person checks next: gain since the start, cash ready, money
 * at work. "Tablo olarak göster" is the keyboard- and screen-reader-friendly view of the line.
 */
export function MoneyHero({ overview, todayPct }: { overview: Overview; todayPct: number | null }) {
  const series = overview.equity_series;
  const [period, setPeriod] = useState<Period>("Tümü");
  const [active, setActive] = useState<number | null>(null);
  const points = useMemo(() => filterPeriod(series, period), [series, period]);
  const at = active !== null ? points[active] : undefined;
  const first = points[0];
  const shown = at ? at.equity : overview.equity_now;
  const { whole, cents } = liraParts(shown);
  const invested = overview.allocations.reduce((s, a) => s + a.amount, 0);
  const choose = (p: Period) => {
    setPeriod(p);
    setActive(null);
  };

  return (
    <section aria-labelledby="paran-baslik" className="solo-hero animate-page-in relative isolate overflow-clip rounded-2xl bg-navy text-on-navy shadow-[var(--shadow-raise)]">
      <HeroRings />
      <div className="px-5 pt-5 pb-4 sm:px-8 sm:pt-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1 id="paran-baslik" className="flex items-center gap-2 text-dense font-medium text-on-navy-soft">
              Paran şu an
              {at ? <span className="rounded-full bg-white/10 px-2 text-meta leading-5 text-on-navy tabular-nums">{dayLabel(at.date)}</span> : null}
            </h1>
            <p className="mt-2 flex flex-wrap items-baseline text-on-navy" data-testid="toplam-para">
              <Figure value={Number(whole.replace(/\D/g, ""))} kind="int" className="solo-figure text-[44px] min-[400px]:text-[52px] sm:text-[72px]" />
              <span className="solo-figure text-[22px] text-on-navy-muted sm:text-[34px]">,{cents}</span>
              <span className="solo-figure ml-1.5 text-[26px] text-on-navy-soft sm:text-[40px]">₺</span>
            </p>
            <p aria-live="polite" className="sr-only" data-testid="grafik-okuma">
              {at ? `${dayLabel(at.date)}: ${fmtLira(at.equity)}` : `Bugün: ${fmtLira(overview.equity_now)}`}
            </p>
            <div className="mt-3 min-h-7">
              {at && first ? <SinceChip from={first} to={at} /> : <TodayChip equityNow={overview.equity_now} pct={todayPct} />}
            </div>
          </div>
          <PeriodToggle series={series} period={period} onChoose={choose} />
        </div>
        <HeroPlot key={period} points={points} capitalStart={overview.capital_start} active={active} onActive={setActive} flat={isFlat(points)} />
      </div>
      <dl className="grid grid-cols-2 border-t border-navy-line sm:grid-cols-3">
        <Stat label="Başladığından beri">
          {Math.round(overview.pnl_abs) === 0 ? (
            <span className="text-ui font-medium text-on-navy-soft">Henüz değişim yok</span>
          ) : (
            <span className={cn("flex flex-wrap items-baseline gap-x-1.5", UP_DOWN(overview.pnl_abs))}>
              <span>{fmtSignedLira(overview.pnl_abs)}</span>
              <span className="text-dense font-semibold">{fmtSignedPct(overview.pnl_pct, 1)}</span>
            </span>
          )}
        </Stat>
        <Stat label="Kullanılabilir nakit">{fmtLira(overview.cash)}</Stat>
        <Stat label="Yatırımda" className="max-sm:hidden">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span>{fmtLira(invested)}</span>
            <span className="text-dense font-medium text-on-navy-muted">{overview.equity_now > 0 ? fmtPct(invested / overview.equity_now, 0) : null}</span>
          </span>
        </Stat>
      </dl>
      <SeriesTable points={points} />
    </section>
  );
}

function TodayChip({ equityNow, pct }: { equityNow: number; pct: number | null }) {
  if (pct === null) return null;
  const amount = todayAmount(equityNow, pct);
  const r = Math.round(amount);
  if (r === 0) return <span className="solo-chip text-on-navy-soft">Bugün değişim yok</span>;
  return (
    <span className={cn("solo-chip", UP_DOWN(r))}>
      <span aria-hidden>{r > 0 ? "▲" : "▼"}</span>
      {fmtSignedLira(amount)} · {fmtSignedPct(pct, 2)}
      <span className="font-medium text-on-navy-soft">bugün</span>
    </span>
  );
}

function SinceChip({ from, to }: { from: EquityPoint; to: EquityPoint }) {
  const delta = to.equity - from.equity;
  const pct = from.equity > 0 ? delta / from.equity : 0;
  return (
    <span className={cn("solo-chip", UP_DOWN(delta))}>
      {fmtSignedLira(delta)} · {fmtSignedPct(pct, 1)}
      <span className="font-medium text-on-navy-soft tabular-nums">
        {dayLabel(from.date)} → {dayLabel(to.date)}
      </span>
    </span>
  );
}

function Stat({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0 px-5 py-4 not-first:border-l not-first:border-navy-line sm:px-8", className)}>
      <dt className="text-dense text-on-navy-muted">{label}</dt>
      <dd className="mt-1 text-[18px] leading-7 font-semibold whitespace-nowrap text-on-navy tabular-nums min-[400px]:text-[20px] sm:text-[22px]">{children}</dd>
    </div>
  );
}

function PeriodToggle({ series, period, onChoose }: { series: readonly EquityPoint[]; period: Period; onChoose: (p: Period) => void }) {
  return (
    <div role="group" aria-label="Dönem" className="flex gap-0.5 rounded-xl bg-white/[0.08] p-1 ring-1 ring-navy-line">
      {PERIODS.map((p) => {
        const distinct = periodIsDistinct(series, p);
        const why = distinct ? PERIOD_LABEL[p] : `${PERIOD_LABEL[p]}: henüz bu kadar uzun bir geçmiş yok`;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            disabled={!distinct}
            title={distinct ? PERIOD_LABEL[p] : "Yeterli geçmiş yok"}
            aria-label={why}
            onClick={() => onChoose(p)}
            className={cn(
              "min-h-9 min-w-12 rounded-lg px-3 text-dense font-semibold tabular-nums transition-[background-color,color,scale] duration-[var(--dur-quick)] ease-[var(--ease-ink)] max-sm:min-h-10",
              period === p ? "bg-on-navy text-navy shadow-[0_1px_2px_rgb(0_0_0/0.25)]" : "text-on-navy-soft hover:bg-white/10 hover:text-on-navy",
              "active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-on-navy",
            )}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

function SeriesTable({ points }: { points: readonly EquityPoint[] }) {
  return (
    <details className="group border-t border-navy-line text-dense">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 font-medium text-on-navy-soft hover:text-on-navy focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-on-navy sm:px-8 [&::-webkit-details-marker]:hidden">
        <svg aria-hidden viewBox="0 0 10 10" className="size-2.5 transition-transform duration-[var(--dur-quick)] group-open:rotate-90" fill="currentColor">
          <path d="M3 1.5 7.5 5 3 8.5Z" />
        </svg>
        Tablo olarak göster
      </summary>
      <div className="max-h-[320px] overflow-y-auto px-5 pb-4 sm:px-8">
        <table className="w-full text-left text-on-navy tabular-nums">
          <caption className="sr-only">Gün gün paranın değeri</caption>
          <thead>
            <tr className="border-b border-navy-line text-on-navy-muted">
              <th scope="col" className="py-1.5 font-medium">
                Gün
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Değer
              </th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.date} className="border-b border-navy-line/60">
                <td className="py-1.5">{dayLabel(p.date)}</td>
                <td className="py-1.5 text-right">{fmtLira(p.equity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** The wordmark's compass rings, faint, off the hero's top-right corner: the desk's bearing. */
function HeroRings() {
  return (
    <svg aria-hidden viewBox="0 0 600 600" className="pointer-events-none absolute -top-64 -right-56 -z-10 size-[560px] text-on-navy opacity-[0.06]" fill="none" stroke="currentColor">
      <circle cx="300" cy="300" r="290" strokeWidth="2" />
      <circle cx="300" cy="300" r="220" strokeWidth="1" />
      <circle cx="300" cy="300" r="150" strokeWidth="1" strokeDasharray="2 10" />
      <path d="M300 10v580M10 300h580" strokeWidth="1" />
    </svg>
  );
}
