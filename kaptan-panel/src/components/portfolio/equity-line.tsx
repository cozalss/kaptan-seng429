"use client";

import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { fmtDateLong, fmtShortDate, fmtSignedPct, fmtTry } from "@/lib/format";
import { cn } from "@/lib/utils";
import { H, linePath, nearestIndex, pct, W, type EquityPoint } from "./equity-math";

export { equitySeries, linePath, seriesChange, yDomain, type EquityPoint } from "./equity-math";

/**
 * Your money over the last sessions, as one calm ink line. Two levels give it meaning: the
 * peak (a hairline) and, under it, the −5% level where the risk monitor stops everything (a
 * north-red threshold, the colour of Durdur). Point, tap or use the arrow keys: a crosshair
 * answers "on this day it was X". The SVG only carries strokes; dots, labels and the
 * crosshair are HTML laid over it, so they stay round and 12px at any width.
 */
export function EquityLine({ points, peak }: { points: readonly EquityPoint[]; peak: number | null }) {
  const geo = linePath(points, peak);
  const [active, setActive] = useState<number | null>(null);
  const first = points[0];
  const end = points[points.length - 1];
  const ready = geo.last !== null && first !== undefined && end !== undefined;
  const at = active !== null ? points[active] : undefined;
  const atMark = active !== null ? geo.xy[active] : undefined;

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setActive(nearestIndex((e.clientX - box.left) / box.width, points.length));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = points.length - 1;
    const from = active ?? last;
    const next = { ArrowLeft: from - 1, ArrowDown: from - 1, ArrowRight: from + 1, ArrowUp: from + 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setActive(Math.min(last, Math.max(0, next)));
  };

  return (
    <figure className="space-y-2">
      <div
        className={cn("relative h-[132px] touch-pan-y select-none sm:h-[176px]", ready && "cursor-crosshair")}
        {...(ready
          ? {
              role: "slider",
              tabIndex: 0,
              "aria-label": "Portföyün gün gün değeri",
              "aria-valuemin": 0,
              "aria-valuemax": points.length - 1,
              "aria-valuenow": active ?? points.length - 1,
              "aria-valuetext": valueText(at ?? end, active === null || active === points.length - 1),
              onPointerMove: onPointer,
              onPointerDown: onPointer,
              onPointerLeave: () => setActive(null),
              onKeyDown: onKey,
              onBlur: () => setActive(null),
            }
          : {})}
      >
        {ready ? (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 block size-full overflow-visible">
              <defs>
                <pattern id="pf-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="5" stroke="var(--ink)" strokeOpacity="0.1" strokeWidth="1" />
                </pattern>
              </defs>
              {geo.peakY !== null ? <Level y={geo.peakY} className="stroke-[var(--rule-soft)]" /> : null}
              {geo.stopY !== null ? <Level y={geo.stopY} dashed className="stroke-north" /> : null}
              <path d={geo.area} fill="url(#pf-hatch)" className="animate-[fade-in_420ms_var(--ease-out-expo)_200ms_both]" />
              {/* Draw-in: dash and gap of 1.25 path lengths, so a stretched, non-scaling stroke is still whole at the end. */}
              <path
                d={geo.line}
                pathLength={1}
                fill="none"
                stroke="var(--ink)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
                className="[stroke-dasharray:1.25] [stroke-dashoffset:1.25] animate-[draw_700ms_var(--ease-out-expo)_forwards]"
              />
            </svg>
            {geo.peakY !== null && peak ? (
              <LevelLabel y={geo.peakY} above>
                zirve · {fmtTry(peak)}
              </LevelLabel>
            ) : null}
            {geo.stopY !== null && peak ? (
              <LevelLabel y={geo.stopY}>
                <span aria-hidden className="mr-1.5 inline-block h-px w-3 -translate-y-[3px] bg-north" />
                −%5 · burada her şey kendiliğinden durur
              </LevelLabel>
            ) : null}
            {atMark ? <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-ink/40" style={{ left: pct(atMark).left }} /> : null}
            <Dot mark={atMark ?? geo.last!} />
            {at && atMark ? <Readout point={at} prev={active ? points[active - 1] : undefined} left={(atMark.x / W) * 100} /> : null}
          </>
        ) : null}
      </div>
      <figcaption className="flex min-h-4 justify-between gap-4 text-meta text-muted tabular-nums">
        {ready ? (
          <>
            <span>
              {fmtShortDate(first.d)} · {fmtTry(first.equity)}
            </span>
            <span className="text-right">
              bugün · <span className="text-ink">{fmtTry(end.equity)}</span>
            </span>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}

function valueText(p: EquityPoint, isToday: boolean): string {
  return `${isToday ? "Bugün" : fmtDateLong(`${p.d}T09:00:00Z`)}: ${fmtTry(p.equity)}`;
}

function Level({ y, dashed = false, className }: { y: number; dashed?: boolean; className: string }) {
  return (
    <line
      x1={0}
      x2={W}
      y1={y}
      y2={y}
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
      strokeDasharray={dashed ? "5 4" : undefined}
      className={cn(className, dashed && "opacity-70")}
    />
  );
}

function LevelLabel({ y, above = false, children }: { y: number; above?: boolean; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute left-0 text-meta whitespace-nowrap text-muted tabular-nums", above ? "-translate-y-[calc(100%+3px)]" : "translate-y-[3px]")}
      style={{ top: `${(y / H) * 100}%` }}
    >
      {children}
    </span>
  );
}

/** The ring on today, or on the day under the crosshair. */
function Dot({ mark }: { mark: { x: number; y: number } }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-paper shadow-[0_0_0_2px_var(--paper)]"
      style={pct(mark)}
    />
  );
}

/** "12 Ara · 1.012.300 TL · +%0,4": the answer for the day under the crosshair. */
function Readout({ point, prev, left }: { point: EquityPoint; prev: EquityPoint | undefined; left: number }) {
  const edge = left < 18 ? "translate-x-0" : left > 82 ? "-translate-x-full" : "-translate-x-1/2";
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute -top-2 z-10 -translate-y-full border border-ink bg-panel px-2 py-1 text-meta whitespace-nowrap tabular-nums", edge)}
      style={{ left: `${left}%` }}
    >
      <span className="text-muted">{fmtShortDate(point.d)}</span>
      <span className="mx-1.5 text-rule-soft">·</span>
      <span className="font-medium text-ink">{fmtTry(point.equity)}</span>
      {prev ? (
        <>
          <span className="mx-1.5 text-rule-soft">·</span>
          <span className="text-ink-soft">{fmtSignedPct(point.equity / prev.equity - 1, 1)}</span>
        </>
      ) : null}
    </span>
  );
}
