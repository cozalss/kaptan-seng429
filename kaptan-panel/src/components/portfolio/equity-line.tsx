"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { fmtDateLong, fmtShortDate, fmtSignedPct, fmtTry, NBSP } from "@/lib/format";
import { cn } from "@/lib/utils";
import { signTone } from "@/components/story/sign-tone";
import { CARD, CARD_PAD } from "./kit";
import { H, linePath, nearestIndex, pct, W, type EquityPoint } from "./equity-math";

export { equitySeries, linePath, seriesChange, yDomain, type EquityPoint } from "./equity-math";

/**
 * The portfolio's value over the last sessions as one line, in a card. Two reference lines:
 * the peak (with its value) and the −5% level where everything stops (north red, the colour of
 * Durdur), and three quiet values on the right. Point, tap or use the arrow keys: a readout
 * answers "on this day it was X, that day's change". "Tablo olarak göster" is the same data as
 * rows. A line that has not moved yet is drawn short, with a sentence instead of a flat box.
 */
export function EquityLine({ points: all, peak, title = "Değer" }: { points: readonly EquityPoint[]; peak: number | null; title?: string }) {
  const [range, setRange] = useState<RangeKey>("all");
  const ranges = RANGES.filter((r) => r.key === "all" || all.length > r.sessions + 1);
  const span = RANGES.find((r) => r.key === range)?.sessions ?? 0;
  const points = useMemo(() => (range === "all" || all.length <= span + 1 ? all : all.slice(-(span + 1))), [all, range, span]);
  const geo = linePath(points, peak);
  const gradientId = useId();
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
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="min-w-0">
          <span className="block text-body font-semibold text-ink">{title}</span>
          {ready && change !== null ? (
            <span className="block text-dense text-muted tabular-nums">
              Son {points.length - 1} seansta <span className={cn("font-semibold", signTone(change))}>{fmtSignedPct(change, 1)}</span>
            </span>
          ) : null}
        </span>
        {ready && ranges.length > 1 ? (
          <span role="group" aria-label="Dönem" className="inline-flex gap-0.5 rounded-lg bg-sunk p-0.5">
            {ranges.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={range === r.key}
                onClick={() => {
                  setRange(r.key);
                  setActive(null);
                }}
                className={cn(
                  "h-8 rounded-md px-2.5 text-dense font-medium tabular-nums transition-[background-color,color,box-shadow] duration-[var(--dur-quick)] max-sm:h-10 max-sm:px-3",
                  range === r.key ? "bg-panel text-ink shadow-[0_1px_2px_rgb(10_33_72/0.16)]" : "text-ink-soft hover:text-ink",
                )}
              >
                {r.label}
              </button>
            ))}
          </span>
        ) : null}
      </figcaption>
      <div className="flex gap-3">
      <div
        className={cn("relative min-w-0 flex-1 touch-pan-y select-none", ready && geo.flat ? "h-[96px]" : "h-[140px] sm:h-[180px]", ready && "cursor-crosshair")}
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
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={geo.area} fill={`url(#${gradientId})`} />
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
                Zirve · {fmtTryShort(peak)}
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
      {ready && !geo.flat ? (
        <div aria-hidden className="relative w-[64px] shrink-0">
          {geo.ticks.map((t) => (
            <span key={t.value} className="absolute right-0 -translate-y-1/2 text-meta whitespace-nowrap text-muted tabular-nums" style={{ top: `${(t.y / H) * 100}%` }}>
              {fmtTryShort(t.value)}
            </span>
          ))}
        </div>
      ) : null}
      </div>
      {ready && geo.flat ? <p className="text-dense text-ink-soft">İlk işlemden sonra çizgi burada şekillenir.</p> : null}
      <div className="flex min-h-5 justify-between gap-4 text-dense text-muted tabular-nums">
        {ready ? (
          <>
            <span>{fmtShortDate(first.d)}</span>
            <span className={geo.flat ? undefined : "mr-[76px]"}>bugün</span>
          </>
        ) : null}
      </div>
      {ready ? <SeriesTable points={points} /> : null}
    </figure>
  );
}

type RangeKey = "5" | "20" | "all";
/** The periods the line can show, in sessions: a week, a month, everything loaded. */
const RANGES: ReadonlyArray<{ key: RangeKey; label: string; sessions: number }> = [
  { key: "5", label: "1 hafta", sessions: 5 },
  { key: "20", label: "1 ay", sessions: 20 },
  { key: "all", label: "Tümü", sessions: 0 },
];

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
        // right-3: clear of today's dot, which sits on the right edge (on the −%5 line when it is hit).
        "pointer-events-none absolute right-3 text-meta font-medium whitespace-nowrap text-muted tabular-nums",
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
      className={cn("pointer-events-none absolute -top-2 z-10 -translate-y-full rounded-md border border-rule-soft bg-panel px-2.5 py-1 text-dense whitespace-nowrap tabular-nums shadow-[0_2px_8px_rgb(16_17_23/0.12)]", edge)}
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

/** "1,02 mn TL" / "850 bin TL": the value axis and the peak label. */
export function fmtTryShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 1_000_000)}${NBSP}mn${NBSP}TL`;
  if (Math.abs(n) >= 1_000) return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(n / 1_000))}${NBSP}bin${NBSP}TL`;
  return fmtTry(n);
}

/** The keyboard- and screen-reader-friendly view of the line: day and value, newest first. */
function SeriesTable({ points }: { points: readonly EquityPoint[] }) {
  return (
    <details className="text-dense">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-ink underline decoration-rule-soft underline-offset-4 hover:decoration-ink sm:min-h-8">Tablo olarak göster</summary>
      <div className="mt-2 max-h-[280px] overflow-y-auto">
        <table className="w-full text-left tabular-nums">
          <caption className="sr-only">Gün gün portföy değeri</caption>
          <thead>
            <tr className="border-b border-line text-muted">
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
              <tr key={p.d} className="border-b border-line">
                <td className="py-1.5">{fmtShortDate(p.d)}</td>
                <td className="py-1.5 text-right">{fmtTry(p.equity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
