"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fmtSignedPct } from "@/lib/format";
import type { EquityPoint } from "@/lib/solo/overview";
import { CHART_H, CHART_W, chartGeometry, filterPeriod, nearestPoint, PERIOD_LABEL, PERIODS, periodIsDistinct, type Period } from "@/lib/solo/period";
import { dayLabel, fmtLira, fmtLiraShort } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { signTone } from "@/components/story/sign-tone";

const pctX = (x: number) => `${(x / CHART_W) * 100}%`;
const pctY = (y: number) => `${(y / CHART_H) * 100}%`;

/**
 * The money over time: one indigo line over a soft area, the money you started with as a thin
 * reference line, and a period toggle (1A · 3A · Tümü). Point, tap or use the arrow keys: a
 * readout answers "on this day you had X". A period that would show the same as "Tümü" is
 * offered but closed, with the reason.
 */
export function MoneyChart({ series, capitalStart }: { series: readonly EquityPoint[]; capitalStart: number }) {
  const [period, setPeriod] = useState<Period>("Tümü");
  const [active, setActive] = useState<number | null>(null);
  const points = useMemo(() => filterPeriod(series, period), [series, period]);
  const first = points[0];
  const last = points[points.length - 1];
  const change = first && last && first.equity > 0 ? last.equity / first.equity - 1 : null;
  const at = active !== null ? points[active] : last;
  const isToday = active === null || active === points.length - 1;

  const choose = (p: Period) => {
    setPeriod(p);
    setActive(null);
  };

  return (
    <figure aria-labelledby="grafik-baslik" className="border-2 border-ink bg-panel">
      <figcaption className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id="grafik-baslik" className="text-title font-semibold text-ink">
            Paranın yolculuğu
          </h2>
          {change !== null && first ? (
            <p className="text-dense text-muted tabular-nums">
              {dayLabel(first.date)} gününden bu yana <span className={cn("font-semibold", signTone(change))}>{fmtSignedPct(change, 1)}</span>
            </p>
          ) : null}
        </div>
        <PeriodToggle series={series} period={period} onChoose={choose} />
      </figcaption>

      <div className="px-4 pt-4 pb-3 sm:px-5">
        <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-2 text-ui text-ink-soft tabular-nums" data-testid="grafik-okuma">
          {at ? (
            <>
              <span>{isToday ? "Bugün" : dayLabel(at.date)}</span>
              <span className="text-[19px] font-semibold text-ink">{fmtLira(at.equity)}</span>
            </>
          ) : null}
        </p>
        <Plot points={points} capitalStart={capitalStart} active={active} onActive={setActive} />
        {first && last ? (
          <div aria-hidden className="mt-1 flex justify-between pr-[76px] text-meta text-muted tabular-nums sm:pr-[88px]">
            <span>{dayLabel(first.date)}</span>
            <span>{dayLabel(last.date)}</span>
          </div>
        ) : null}
        <SeriesTable points={points} />
      </div>
    </figure>
  );
}

function PeriodToggle({ series, period, onChoose }: { series: readonly EquityPoint[]; period: Period; onChoose: (p: Period) => void }) {
  return (
    <div role="group" aria-label="Dönem" className="flex border-2 border-ink">
      {PERIODS.map((p) => {
        const distinct = periodIsDistinct(series, p);
        const why = distinct ? PERIOD_LABEL[p] : `${PERIOD_LABEL[p]}: henüz bu kadar uzun bir geçmiş yok`;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            disabled={!distinct}
            title={why}
            aria-label={why}
            onClick={() => onChoose(p)}
            className={cn(
              "min-h-10 min-w-12 px-3 text-dense font-semibold tabular-nums transition-colors duration-[var(--dur-quick)] not-first:border-l-2 not-first:border-ink",
              period === p ? "bg-ink text-paper" : "bg-panel text-ink hover:bg-wash-tint",
              "disabled:cursor-not-allowed disabled:text-muted disabled:line-through disabled:hover:bg-panel",
              "focus-visible:relative focus-visible:z-10",
            )}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

function Plot({
  points,
  capitalStart,
  active,
  onActive,
}: {
  points: readonly EquityPoint[];
  capitalStart: number;
  active: number | null;
  onActive: (i: number | null) => void;
}) {
  const gradientId = useId();
  const geo = useMemo(() => chartGeometry(points, capitalStart), [points, capitalStart]);
  if (!geo) return <p className="mt-4 text-ui text-ink-soft">Grafik için en az iki günlük kayıt gerekiyor.</p>;
  const at = points[active ?? points.length - 1];
  const mark = active !== null ? geo.xy[active] : undefined;

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    onActive(nearestPoint((e.clientX - box.left) / box.width, points.length));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const end = points.length - 1;
    const from = active ?? end;
    const next = { ArrowLeft: from - 1, ArrowDown: from - 1, ArrowRight: from + 1, ArrowUp: from + 1, Home: 0, End: end }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onActive(Math.min(end, Math.max(0, next)));
  };

  return (
    <div className="relative mt-2 flex gap-3">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Paranın gün gün değeri"
        aria-valuemin={0}
        aria-valuemax={points.length - 1}
        aria-valuenow={active ?? points.length - 1}
        aria-valuetext={at ? `${dayLabel(at.date)}: ${fmtLira(at.equity)}` : undefined}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => onActive(null)}
        onKeyDown={onKey}
        onBlur={() => onActive(null)}
        className="relative h-[180px] min-w-0 flex-1 cursor-crosshair touch-pan-y select-none sm:h-[220px] lg:h-[260px]"
      >
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--solo-area-top)" />
              <stop offset="100%" stopColor="var(--solo-area-bottom)" />
            </linearGradient>
          </defs>
          {geo.ticks.map((t) => (
            <line key={t} x1={0} x2={CHART_W} y1={geo.yOf(t)} y2={geo.yOf(t)} stroke="var(--hairline)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={0} x2={CHART_W} y1={geo.yOf(capitalStart)} y2={geo.yOf(capitalStart)} stroke="var(--rule-soft)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={geo.area} fill={`url(#${gradientId})`} />
          <path d={geo.line} fill="none" stroke="var(--brand)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {mark ? (
          <>
            <span aria-hidden className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink" style={{ left: pctX(mark.x) }} />
            <span
              aria-hidden
              className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-brand"
              style={{ left: pctX(mark.x), top: pctY(mark.y) }}
            />
          </>
        ) : null}
        <span aria-hidden className="pointer-events-none absolute left-1 -translate-y-full pb-0.5 text-meta font-medium text-muted" style={{ top: pctY(geo.yOf(capitalStart)) }}>
          Başlangıç
        </span>
      </div>
      <div aria-hidden className="relative w-[64px] shrink-0 sm:w-[76px]">
        {geo.ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2 text-meta whitespace-nowrap text-muted tabular-nums" style={{ top: pctY(geo.yOf(t)) }}>
            {fmtLiraShort(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

function SeriesTable({ points }: { points: readonly EquityPoint[] }) {
  return (
    <details className="mt-3 text-dense">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-ink underline decoration-rule-soft underline-offset-4 hover:decoration-ink">
        Tablo olarak göster
      </summary>
      <table className="mt-2 w-full text-left tabular-nums">
        <caption className="sr-only">Gün gün paranın değeri</caption>
        <thead>
          <tr className="border-b-2 border-ink">
            <th scope="col" className="py-1 font-semibold">
              Gün
            </th>
            <th scope="col" className="py-1 text-right font-semibold">
              Değer
            </th>
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map((p) => (
            <tr key={p.date} className="border-b border-hairline">
              <td className="py-1">{dayLabel(p.date)}</td>
              <td className="py-1 text-right">{fmtLira(p.equity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
