"use client";

import { useState, type PointerEvent, type ReactNode } from "react";

/** The drawing box every company chart uses (viewBox units). */
export const CHART_W = 640;
export const CHART_PAD = 8;

export interface ChartTick {
  /** Height in viewBox units (0 = top). */
  y: number;
  label: string;
  /** The reference line's label (the start): ink, semibold. */
  strong?: boolean;
}

export interface ChartMark {
  /** Height in viewBox units. */
  y: number;
  /** "a" = the main line (ink), "b" = the comparison line. */
  series: "a" | "b";
  /** A name printed beside the last day's mark (the compare chart's tickers), so the lines differ without colour. */
  label?: string;
}

/** Two end names closer than this share of the height are pushed apart. */
const END_GAP = 0.12;

/** Where each end name sits: on its line's end, or nudged apart when the two ends are close. Pure; also used in tests. */
export function endNameOffsets(ends: readonly ChartMark[], h: number): number[] {
  const [first, second] = ends;
  if (!first || !second || Math.abs(first.y - second.y) >= h * END_GAP) return ends.map((m) => m.y);
  const mid = (first.y + second.y) / 2;
  const half = (h * END_GAP) / 2;
  const firstAbove = first.y <= second.y;
  return [firstAbove ? mid - half : mid + half, firstAbove ? mid + half : mid - half, ...ends.slice(2).map((m) => m.y)];
}

interface ChartFrameProps {
  /** viewBox height. */
  h: number;
  /** How many days are drawn left to right. */
  count: number;
  /** The scale, read off a right gutter. */
  ticks: readonly ChartTick[];
  /** The dots of the last day. */
  ends: readonly ChartMark[];
  /** The dots under the crosshair for a day. */
  marksAt: (i: number) => readonly ChartMark[];
  /** What the tooltip says for a day. */
  tipAt: (i: number) => ReactNode;
  /** The svg drawing itself. */
  children: ReactNode;
}

/** x in viewBox units for day i. */
export function chartX(i: number, count: number): number {
  return CHART_PAD + (count > 1 ? i / (count - 1) : 0) * (CHART_W - 2 * CHART_PAD);
}

/**
 * The frame both company charts share: the scale in a right gutter (labels never sit on the line), the last
 * day's dot, and a crosshair with the day's values under the pointer. Decoration for the eye only: the svg
 * carries the summary sentence and the figures are in the text around it, so the frame is aria-hidden.
 */
export function ChartFrame({ h, count, ticks, ends, marksAt, tipAt, children }: ChartFrameProps) {
  const [hover, setHover] = useState<number | null>(null);
  // A scale label too close to the start's label would print on top of it: the start wins.
  const strong = ticks.filter((t) => t.strong);
  const shown = ticks.filter((t) => t.strong || strong.every((s) => Math.abs(s.y - t.y) > h * 0.1));
  const pctX = (i: number) => `${(chartX(i, count) / CHART_W) * 100}%`;
  const pctY = (y: number) => `${(y / h) * 100}%`;
  const nameYs = endNameOffsets(ends, h);

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const t = (e.clientX - r.left) / r.width;
    const i = Math.round(((t * CHART_W - CHART_PAD) / (CHART_W - 2 * CHART_PAD)) * (count - 1));
    setHover(Math.max(0, Math.min(count - 1, i)));
  }

  return (
    <div className="co-plot">
      <div className="co-box" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {children}
        {ends.map((m) => (
          <span key={`end-${m.series}`} aria-hidden className="co-end" data-series={m.series} style={{ left: pctX(count - 1), top: pctY(m.y) }} />
        ))}
        {ends.map((m, i) =>
          m.label ? (
            <span key={`name-${m.series}`} aria-hidden className="co-end-name" data-series={m.series} style={{ top: pctY(nameYs[i] ?? m.y) }}>
              {m.label}
            </span>
          ) : null,
        )}
        {hover !== null ? (
          <>
            <span aria-hidden className="co-cross" style={{ left: pctX(hover) }} />
            {marksAt(hover).map((m) => (
              <span key={`dot-${m.series}`} aria-hidden className="co-dot" data-series={m.series} style={{ left: pctX(hover), top: pctY(m.y) }} />
            ))}
            <span aria-hidden className="co-tip" data-side={hover > count / 2 ? "left" : "right"} style={{ left: pctX(hover) }}>
              {tipAt(hover)}
            </span>
          </>
        ) : null}
      </div>
      {shown.map((t) => (
        <span key={`${t.label}-${t.y}`} aria-hidden className={t.strong ? "co-tick co-tick--water" : "co-tick"} style={{ top: pctY(t.y) }}>
          {t.label}
        </span>
      ))}
    </div>
  );
}
