"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Width of an element, tracked with ResizeObserver (charts get explicit pixel sizes: no SSR warnings). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  dash?: string;
  /** "line" mirrors line marks, "rect" bars/areas, "rule" threshold lines. */
  shape?: "line" | "rect" | "rule";
}

/** Legend keys mirror the mark: a short stroke (with its dash) for lines, a swatch for areas. */
export function Legend({ items, className }: { items: readonly LegendItem[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-soft", className)}>
      {items.map((it) => (
        <li key={it.key} className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="22" height="10" viewBox="0 0 22 10" className="shrink-0">
            {it.shape === "rect" ? (
              <rect x="3" y="1" width="16" height="8" fill={it.color} />
            ) : (
              <line x1="1" x2="21" y1="5" y2="5" stroke={it.color} strokeWidth={it.shape === "rule" ? 1.25 : 2} strokeDasharray={it.dash} />
            )}
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * A chart's frame: title row, legend, the plot (or its table twin), and a caption. The table
 * view is the WCAG-clean equivalent (dataviz: tooltips enhance, never gate). `sample` stamps
 * the plot with ÖRNEK so a screenshot can never pass for a real result.
 */
export function ChartFrame({
  title,
  meta,
  legend,
  table,
  sample = false,
  caption,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  legend?: readonly LegendItem[];
  table: ReactNode;
  sample?: boolean;
  caption?: ReactNode;
  actions?: ReactNode;
  children: (width: number) => ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const [ref, width] = useWidth<HTMLDivElement>();
  const headId = useId();
  return (
    <figure aria-labelledby={headId} className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-[min(100%,280px)] flex-1">
          <h3 id={headId} className="text-[15px] font-medium leading-5 text-ink">
            {title}
          </h3>
          {meta ? <p className="mt-0.5 text-meta text-muted">{meta}</p> : null}
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {actions}
          <button
            type="button"
            aria-pressed={showTable}
            onClick={() => setShowTable((v) => !v)}
            className="inline-flex h-8 items-center border border-rule-soft bg-panel px-2.5 text-dense text-ink-soft hover:border-ink hover:text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-on-dark"
          >
            Tablo
          </button>
        </div>
      </div>
      {legend && !showTable ? <Legend items={legend} className="mt-2" /> : null}
      <div ref={ref} className="relative mt-3 min-w-0">
        {showTable ? (
          table
        ) : (
          <>
            {sample ? (
              <span aria-hidden className="pointer-events-none absolute top-2 right-3 z-[1] border border-rule-soft bg-panel/80 px-1.5 text-meta font-medium text-muted">
                ÖRNEK · gerçek sonuç değil
              </span>
            ) : null}
            {width > 0 ? children(width) : <div className="h-[220px]" />}
          </>
        )}
      </div>
      {caption ? <figcaption className="mt-2 text-meta text-muted">{caption}</figcaption> : null}
    </figure>
  );
}

/** Tooltip shell shared by the Recharts charts: values lead, series names follow. */
export function TooltipCard({ title, rows }: { title: ReactNode; rows: ReadonlyArray<{ key: string; label: string; value: string; color: string; dash?: string }> }) {
  return (
    <div className="min-w-[180px] border-[1.5px] border-ink bg-panel px-3 py-2 shadow-ink">
      <div className="text-meta text-muted">{title}</div>
      <ul className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2 text-dense">
            <svg aria-hidden width="14" height="6" viewBox="0 0 14 6">
              <line x1="0" x2="14" y1="3" y2="3" stroke={r.color} strokeWidth="2" strokeDasharray={r.dash} />
            </svg>
            <b className="font-medium tabular-nums text-ink">{r.value}</b>
            <span className="text-ink-soft">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
