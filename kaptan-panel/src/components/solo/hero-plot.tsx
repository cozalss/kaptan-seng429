"use client";

import { useId, useMemo, type KeyboardEvent, type PointerEvent } from "react";
import type { EquityPoint } from "@/lib/solo/overview";
import { CHART_H, CHART_W, chartGeometry, nearestPoint } from "@/lib/solo/period";
import { dayLabel, fmtLira, fmtLiraShort } from "@/lib/solo/words";
import { cn } from "@/lib/utils";

const pctX = (x: number) => `${(x / CHART_W) * 100}%`;
const pctY = (y: number) => `${(y / CHART_H) * 100}%`;

export interface HeroPlotProps {
  points: readonly EquityPoint[];
  capitalStart: number;
  active: number | null;
  onActive: (i: number | null) => void;
  /** Few days or no movement yet: a short plot and a line saying it will fill in. */
  flat: boolean;
}

/**
 * The money's line on the navy hero: a light line over a soft glow, the money you started with
 * as a dashed reference, three quiet value ticks on the right. Point, tap or use the arrow keys;
 * the hero figure above follows (the readout lives there). The line draws itself once.
 */
export function HeroPlot({ points, capitalStart, active, onActive, flat }: HeroPlotProps) {
  const gradientId = useId();
  const geo = useMemo(() => chartGeometry(points, capitalStart), [points, capitalStart]);
  if (!geo) return <p className="mt-6 text-ui text-on-navy-soft">Grafik için en az iki günlük kayıt gerekiyor.</p>;
  const at = points[active ?? points.length - 1];
  const mark = active !== null ? geo.xy[active] : geo.xy[geo.xy.length - 1];
  const markX = mark ? mark.x / CHART_W : 1;

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
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="mt-6">
      <div className="relative flex gap-3">
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
          className={cn(
            "relative min-w-0 flex-1 cursor-crosshair touch-pan-y rounded-md select-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-on-navy",
            flat ? "h-[120px]" : "h-[180px] sm:h-[240px]",
          )}
        >
          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden className="solo-draw absolute inset-0 size-full overflow-visible">
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--solo-hero-area)" />
                <stop offset="100%" stopColor="var(--solo-hero-area)" stopOpacity={0} />
              </linearGradient>
            </defs>
            {geo.ticks.map((t) => (
              <line key={t} x1={0} x2={CHART_W} y1={geo.yOf(t)} y2={geo.yOf(t)} stroke="var(--solo-hero-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            <line
              x1={0}
              x2={CHART_W}
              y1={geo.yOf(capitalStart)}
              y2={geo.yOf(capitalStart)}
              stroke="var(--solo-hero-base)"
              strokeWidth={1.25}
              strokeDasharray="4 5"
              vectorEffect="non-scaling-stroke"
            />
            <path d={geo.area} fill={`url(#${gradientId})`} />
            <path d={geo.line} fill="none" stroke="var(--solo-hero-line)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 -translate-y-[calc(100%+4px)] rounded bg-navy/85 px-1.5 text-meta font-medium whitespace-nowrap text-on-navy-soft tabular-nums"
            style={{ top: pctY(geo.yOf(capitalStart)) }}
          >
            Başlangıç · {fmtLira(capitalStart)}
          </span>
          {mark ? (
            <>
              {active !== null ? (
                <>
                  <span aria-hidden className="pointer-events-none absolute top-0 bottom-0 w-px bg-on-navy/45" style={{ left: pctX(mark.x) }} />
                  {at ? (
                    <span
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute -top-1 -translate-y-full rounded-md bg-on-navy px-2 py-0.5 text-meta font-semibold whitespace-nowrap text-navy tabular-nums shadow-[var(--shadow-pop)]",
                        markX > 0.85 ? "-translate-x-full" : markX < 0.15 ? "" : "-translate-x-1/2",
                      )}
                      style={{ left: pctX(mark.x) }}
                    >
                      {dayLabel(at.date)}
                    </span>
                  ) : null}
                </>
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-on-navy ring-4 ring-[var(--solo-hero-ring)]",
                  active === null && "solo-pulse",
                )}
                style={{ left: pctX(mark.x), top: pctY(mark.y) }}
              />
            </>
          ) : null}
        </div>
        <div aria-hidden className="relative w-[60px] shrink-0 sm:w-[72px]">
          {geo.ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 text-meta whitespace-nowrap text-on-navy-muted tabular-nums" style={{ top: pctY(geo.yOf(t)) }}>
              {fmtLiraShort(t)}
            </span>
          ))}
        </div>
      </div>
      {first && last ? (
        <div aria-hidden className="mt-2 flex justify-between pr-[72px] text-meta text-on-navy-muted tabular-nums sm:pr-[84px]">
          <span>{dayLabel(first.date)}</span>
          <span>{dayLabel(last.date)}</span>
        </div>
      ) : null}
      {flat ? <p className="mt-3 text-dense text-on-navy-soft">İlk işlemden sonra grafik burada şekillenir.</p> : null}
    </div>
  );
}
