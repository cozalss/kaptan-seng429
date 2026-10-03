"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { fmtDuration, shortHash } from "@/lib/format";
import { useNow } from "@/lib/clock";

/**
 * Countdown to an ISO time (e.g. approval expiry 09:50 next session). Turns north red in
 * the last 15 minutes; announces nothing (it is a clock, not news).
 */
export function Countdown({ to, label = "Kalan", className }: { to: string; label?: string; className?: string }) {
  const now = useNow(1_000);
  const left = now === null ? null : Date.parse(to) - now;
  const urgent = left !== null && left > 0 && left < 15 * 60_000;
  const over = left !== null && left <= 0;
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 tabular-nums", className)}>
      <span className="text-meta text-muted">{label}</span>
      <time dateTime={to} className={cn("text-dense font-medium", urgent && "text-north", over && "text-muted line-through")}>
        {left === null ? "—" : fmtDuration(left)}
      </time>
    </span>
  );
}

/** Hash chip: short mono hash with full value on hover and click-to-copy. */
export function HashChip({ hash, label, className }: { hash: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={hash}
      aria-label={`${label ?? "Hash"} ${hash} — kopyala`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(hash);
          setCopied(true);
          setTimeout(() => setCopied(false), 1_400);
        } catch {
          setCopied(false);
        }
      }}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 border border-rule-soft bg-sunk px-1.5 text-ink-soft hover:border-ink hover:text-ink",
        className,
      )}
    >
      {label ? <span className="text-meta text-muted">{label}</span> : null}
      <span className="code">{copied ? "kopyalandı" : shortHash(hash)}</span>
    </button>
  );
}

/**
 * Sparkline: a hand-inked line (SVG, no library). Optional baseline at 0 and a final dot.
 * Values are plotted as given; pass returns or equity.
 */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  baseline,
  tone = "ink",
  label,
  className,
}: {
  values: readonly number[];
  width?: number;
  height?: number;
  baseline?: number;
  tone?: "ink" | "wash" | "north";
  label: string;
  className?: string;
}) {
  if (values.length < 2) return <svg width={width} height={height} role="img" aria-label={label} className={className} />;
  const lo = Math.min(...values, baseline ?? Infinity);
  const hi = Math.max(...values, baseline ?? -Infinity);
  const span = hi - lo || 1;
  const pad = 3;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const color = tone === "north" ? "var(--north)" : tone === "wash" ? "var(--wash)" : "var(--ink)";
  const last = values[values.length - 1] as number;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={className}>
      {baseline !== undefined ? (
        <line x1={pad} x2={width - pad} y1={y(baseline)} y2={y(baseline)} stroke="var(--rule-soft)" strokeDasharray="2 3" strokeWidth={1} />
      ) : null}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.2} fill={color} />
    </svg>
  );
}
