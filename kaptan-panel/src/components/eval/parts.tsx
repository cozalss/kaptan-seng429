import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { bulletFraction } from "./eval-math";

/**
 * Layer heading: a big Bodoni ordinal, the question the layer answers, and its source. Every
 * section of /eval opens the same way so the four layers read as one argument.
 */
export function LayerHead({ id, n, title, question, source, aside }: { id: string; n: string; title: string; question: string; source: string; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-x-5 gap-y-2 border-b-[1.5px] border-ink pb-3">
      <span aria-hidden className="font-display text-[56px] leading-[0.8] text-ink">
        {n}
      </span>
      <div className="min-w-[min(100%,300px)] flex-1">
        <h2 id={id} className="font-display text-[28px] leading-tight text-ink">
          {title}
        </h2>
        <p className="mt-0.5 text-dense text-ink-soft">
          {question} <span className="text-muted">· {source}</span>
        </p>
      </div>
      {aside}
    </header>
  );
}

/**
 * Bullet: value as an ink bar on a 0…max scale with the target as a tick. Shows distance to a
 * target without declaring a verdict (sample values must never read as achievements).
 */
export function Bullet({
  value,
  max,
  target,
  label,
  valueText,
  targetText,
  lowerIsBetter = false,
  className,
}: {
  value: number;
  max: number;
  target?: number;
  label: string;
  valueText: string;
  targetText?: string;
  lowerIsBetter?: boolean;
  className?: string;
}) {
  const f = bulletFraction(value, max);
  return (
    <div className={cn("w-full", className)}>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${valueText}${targetText ? `, hedef ${targetText}` : ""}`}
        className="relative h-2.5 bg-sunk"
      >
        <div className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${f * 100}%` }} />
        {target !== undefined ? (
          <div aria-hidden className="absolute -top-1 -bottom-1 w-[2px] bg-wash" style={{ left: `calc(${bulletFraction(target, max) * 100}% - 1px)` }} />
        ) : null}
      </div>
      {targetText ? (
        <p aria-hidden className="mt-1 text-meta text-muted">
          hedef {lowerIsBetter ? "≤" : "≥"} {targetText}
        </p>
      ) : null}
    </div>
  );
}

/** Two-column definition row used in dense metric lists. */
export function MetricRow({ k, v, hint }: { k: ReactNode; v: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-hairline py-2 last:border-b-0">
      <dt className="flex-1 text-dense text-ink-soft">{k}</dt>
      <dd className="text-right">
        <span className="text-[15px] font-medium tabular-nums text-ink">{v}</span>
        {hint ? <span className="block text-meta text-muted">{hint}</span> : null}
      </dd>
    </div>
  );
}
