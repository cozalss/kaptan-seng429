import { useId } from "react";
import { cn } from "@/lib/utils";

const W = 120;
const H = 32;

/** The sparkline's path in a 120 × 32 box (min..max of the values, 2px inset); null when flat or too short. */
export function sparkPath(values: readonly number[]): { line: string; area: string } | null {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // A flat line says nothing a figure does not: draw none.
  if (hi === lo) return null;
  const span = hi - lo;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, 2 + (1 - (v - lo) / span) * (H - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return { line, area: `${line} L${W} ${H} L0 ${H} Z` };
}

/**
 * A word-sized trend line for a KPI tile: no axes, no labels, one stroke and a faint wash
 * under it. Decoration beside a figure that already says the number (aria-hidden).
 */
export function Sparkline({ values, className }: { values: readonly number[]; className?: string }) {
  const id = useId();
  const geo = sparkPath(values);
  if (!geo) return null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className={cn("block overflow-visible", className)}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={geo.area} fill={`url(#${id}-fill)`} />
      <path d={geo.line} fill="none" stroke="currentColor" strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
