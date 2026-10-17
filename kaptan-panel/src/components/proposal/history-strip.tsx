"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { EvidenceEvent } from "@/lib/domain";
import { fmtInt, fmtSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { shortName } from "@/components/story/plain";
import { titleTr } from "@/components/story/turkish";
import { signTone } from "@/components/story/sign-tone";

/**
 * Past similar events as a pile of small squares: each square is one event, set in the
 * column of how far the stock moved in 5 days (1 % per column, ±10 % across). Left of the zero
 * line it fell (open claret squares), right of it it rose (filled deep green); the open/filled
 * difference carries the meaning without colour too. The two counts sit over their
 * halves, so the answer reads at a glance; a pointer or ← → names any one event, ▲ marks the median.
 */
const W = 640;
const PAD = 14;
const SPAN = 0.1; // ±10 % fills the width; larger moves sit on the edge
const BIN = 0.01;
const BINS = Math.round((2 * SPAN) / BIN);
const SQ = 13;
const STEP = 17;
const GAP = 3; // between the baseline and the lowest square

export function stripX(ret: number): number {
  const clamped = Math.max(-SPAN, Math.min(SPAN, ret));
  return PAD + ((clamped + SPAN) / (2 * SPAN)) * (W - 2 * PAD);
}

interface Pip {
  event: EvidenceEvent;
  x: number;
  level: number;
}

/** Each event's column centre and its height in the pile (pure, so the layout is testable). */
export function pilePips(events: readonly EvidenceEvent[]): Pip[] {
  const colW = (W - 2 * PAD) / BINS;
  const heights = new Map<number, number>();
  return [...events]
    .sort((a, b) => a.car_5d - b.car_5d)
    .map((event) => {
      const clamped = Math.max(-SPAN, Math.min(SPAN - 1e-9, event.car_5d));
      // A move of exactly 0 counts as "fell" (not rose), so it sits just left of the line.
      const col = event.car_5d === 0 ? BINS / 2 - 1 : Math.floor((clamped + SPAN) / BIN);
      const level = heights.get(col) ?? 0;
      heights.set(col, level + 1);
      return { event, x: PAD + col * colW + colW / 2, level };
    });
}

export function HistoryStrip({ events, median, total }: { events: readonly EvidenceEvent[]; median: number; total: number }) {
  const pips = pilePips(events);
  const [active, setActive] = useState<number | null>(null);
  const up = events.filter((e) => e.car_5d > 0).length;
  const down = events.length - up;
  const tallest = Math.max(1, ...pips.map((p) => p.level + 1));
  const base = 8 + tallest * STEP;
  const H = base + 16;
  const mid = W / 2;
  const current = active !== null ? pips[active] : null;

  const nearest = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    let best: number | null = null;
    pips.forEach((p, i) => {
      if (best === null || Math.abs(p.x - x) < Math.abs((pips[best]?.x ?? 0) - x)) best = i;
    });
    setActive(best);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!pips.length) return;
    const last = pips.length - 1;
    const next =
      e.key === "ArrowRight" ? Math.min(last, (active ?? -1) + 1) : e.key === "ArrowLeft" ? Math.max(0, (active ?? last + 1) - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) {
      if (e.key === "Escape") setActive(null);
      return;
    }
    e.preventDefault();
    setActive(next);
  };

  return (
    <figure className="mt-5">
      <div aria-hidden className="grid grid-cols-2 items-end">
        <p className="pr-4 text-right">
          <span className="text-title leading-none font-semibold text-loss tabular-nums">{fmtInt(down)}</span>
          <span className="ml-1.5 text-dense font-medium text-ink-soft">düştü</span>
        </p>
        <p className="pl-4">
          <span className="text-title leading-none font-semibold text-gain tabular-nums">{fmtInt(up)}</span>
          <span className="ml-1.5 text-dense font-medium text-ink-soft">yükseldi</span>
        </p>
      </div>
      <div
        tabIndex={0}
        role="group"
        aria-label="Olayları tek tek gez: sol ve sağ ok tuşları"
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        className="group/strip mt-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${fmtInt(events.length)} benzer olay: ${fmtInt(up)} yükseldi, ${fmtInt(down)} düştü; ortanca ${fmtSignedPct(median)}.`}
          className="h-auto w-full touch-pan-y overflow-visible"
          onPointerMove={nearest}
          onPointerDown={nearest}
          onPointerLeave={(e) => (e.pointerType === "mouse" ? setActive(null) : undefined)}
        >
          <rect x={PAD} y={0} width={W / 2 - PAD} height={base} fill="color-mix(in srgb, var(--loss) 7%, transparent)" />
          <rect x={mid} y={0} width={W / 2 - PAD} height={base} fill="color-mix(in srgb, var(--gain) 10%, transparent)" />
          <line x1={PAD} x2={W - PAD} y1={base} y2={base} stroke="var(--ink)" strokeWidth={2} />
          <line x1={mid} x2={mid} y1={-4} y2={base + 6} stroke="var(--ink)" strokeWidth={2.5} />
          {pips.map((p, i) => {
            const rose = p.event.car_5d > 0;
            const on = i === active;
            const y = base - GAP - SQ - p.level * STEP;
            return (
              <rect
                key={p.event.ref_id}
                x={p.x - SQ / 2}
                y={y}
                width={SQ}
                height={SQ}
                fill={on ? "var(--wash)" : rose ? "var(--gain)" : "var(--panel)"}
                stroke={on ? "var(--wash)" : rose ? "var(--gain)" : "var(--loss)"}
                strokeWidth={2}
              />
            );
          })}
          <path d={`M${stripX(median) - 6} ${H} L${stripX(median) + 6} ${H} L${stripX(median)} ${H - 10} Z`} fill="var(--ink)" />
        </svg>
      </div>
      <div aria-hidden className="mt-0.5 grid grid-cols-3 text-meta font-medium text-ink-soft tabular-nums">
        <span>−%10</span>
        <span className="text-center">0</span>
        <span className="text-right">+%10</span>
      </div>
      <figcaption className="mt-2 flex min-h-[22px] flex-wrap items-baseline gap-x-2 text-dense text-ink-soft" aria-live="polite">
        {current ? (
          <>
            <span className="font-medium text-ink">{titleTr(shortName(current.event.company_name))}</span>
            <span>5 günde</span>
            <span className={cn("font-semibold tabular-nums", signTone(current.event.car_5d))}>{fmtSignedPct(current.event.car_5d)}</span>
          </>
        ) : (
          <>
            <span>
              Her kare bir olay; 5 günlük hareket.{events.length < total ? ` Çizgide ${fmtInt(events.length)} olay.` : ""}
            </span>
            <span aria-hidden className="text-rule-soft">
              ·
            </span>
            <span>
              ▲ ortanca (tümü) <span className={cn("font-semibold tabular-nums", signTone(median))}>{fmtSignedPct(median)}</span>
            </span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
