"use client";

import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { fmtDateLong, fmtShortDate, fmtSignedPct, fmtTry } from "@/lib/format";
import { cn } from "@/lib/utils";
import { signTone } from "@/components/story/sign-tone";
import { CARD, CARD_PAD } from "./kit";
import { H, linePath, nearestIndex, pct, W, type EquityPoint } from "./equity-math";

export { equitySeries, linePath, seriesChange, yDomain, type EquityPoint } from "./equity-math";

/**
 * The portfolio's value over the last sessions as one line, in a card. Two reference lines:
 * the peak and the −5% level where everything stops (north red, the colour of Durdur).
 * Point, tap or use the arrow keys: a readout answers "on this day it was X".
 */
export function EquityLine({ points, peak }: { points: readonly EquityPoint[]; peak: number | null }) {
  const geo = linePath(points, peak);
  const [active, setActive] = useState<number | null>(null);
  const first = points[0];
  const end = points[points.length - 1];
  const ready = geo.last !== null && first !== undefined && end !== undefined;
  const at = active !== null ? points[active] : undefined;
  const atMark = active !== null ? geo.xy[active] : undefined;
  const change = ready ? end.equity / first.equity - 1 : null;

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
    <figure className={cn(CARD, CARD_PAD, "space-y-4")}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[18px] leading-7 font-semibold text-ink">Değer</span>
        {ready && change !== null ? (
          <span className="text-dense text-muted tabular-nums">
            Son {points.length - 1} seansta <span className={cn("font-semibold", signTone(change))}>{fmtSignedPct(change, 1)}</span>
          </span>
        ) : null}
      </figcaption>
      <div
        className={cn("relative h-[140px] touch-pan-y select-none sm:h-[180px]", ready && "cursor-crosshair")}
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
              {geo.peakY !== null ? <Level y={geo.peakY} className="stroke-[var(--rule-soft)]" /> : null}
              {geo.stopY !== null ? <Level y={geo.stopY} dashed className="stroke-north" /> : null}
              <path
                d={geo.line}
                fill="none"
                stroke="var(--brand)"
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            {geo.peakY !== null && peak ? (
              <LevelLabel y={geo.peakY} above>
                Zirve
              </LevelLabel>
            ) : null}
            {geo.stopY !== null && peak ? (
              <LevelLabel y={geo.stopY} className="text-north">
                −%5: her şey durur
              </LevelLabel>
            ) : null}
            {atMark ? <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-ink/60" style={{ left: pct(atMark).left }} /> : null}
            <Dot mark={atMark ?? geo.last!} />
            {at && atMark ? <Readout point={at} prev={active ? points[active - 1] : undefined} left={(atMark.x / W) * 100} /> : null}
          </>
        ) : null}
      </div>
      <div className="flex min-h-5 justify-between gap-4 text-dense text-muted tabular-nums">
        {ready ? (
          <>
            <span>{fmtShortDate(first.d)}</span>
            <span>bugün</span>
          </>
        ) : null}
      </div>
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
      strokeWidth={dashed ? 1.5 : 1}
      vectorEffect="non-scaling-stroke"
      strokeDasharray={dashed ? "6 4" : undefined}
      className={className}
    />
  );
}

function LevelLabel({ y, above = false, className, children }: { y: number; above?: boolean; className?: string; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute right-0 text-meta font-medium whitespace-nowrap text-muted tabular-nums",
        above ? "-translate-y-[calc(100%+2px)]" : "translate-y-[2px]",
        className,
      )}
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
      className="pointer-events-none absolute size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-brand bg-panel shadow-[0_0_0_2px_var(--panel)]"
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
      className={cn("pointer-events-none absolute -top-2 z-10 -translate-y-full border border-rule-soft bg-panel px-2.5 py-1 text-dense whitespace-nowrap tabular-nums shadow-[0_2px_8px_rgb(16_17_23/0.12)]", edge)}
      style={{ left: `${left}%` }}
    >
      <span className="text-muted">{fmtShortDate(point.d)}</span>
      <span className="mx-1.5 text-rule-soft">·</span>
      <span className="font-medium text-ink">{fmtTry(point.equity)}</span>
      {prev ? (
        <>
          <span className="mx-1.5 text-rule-soft">·</span>
          <span className={cn("font-medium", signTone(point.equity / prev.equity - 1))}>{fmtSignedPct(point.equity / prev.equity - 1, 1)}</span>
        </>
      ) : null}
    </span>
  );
}
