import type { PnlPoint } from "@/lib/domain";
import { fmtShortDate, fmtTry } from "@/lib/format";

/**
 * One small line: your money over the last sessions plus today. No axes, no grid — the first
 * and last dates under it and a dot on today. A thin wash under the line gives it weight.
 */
const W = 640;
const H = 120;
const PAD = 6;

export interface EquityPoint {
  d: string;
  equity: number;
}

/** The live strategy's closes, newest `n`, with today's intraday value appended. */
export function equitySeries(pnl: readonly PnlPoint[], strategy: string, today: EquityPoint | null, n = 40): EquityPoint[] {
  const closes = pnl.filter((p) => p.strategy === strategy).map((p) => ({ d: p.d, equity: p.equity }));
  const base = today ? closes.filter((p) => p.d < today.d) : closes;
  return [...base.slice(-n), ...(today ? [today] : [])];
}

export function linePath(points: readonly EquityPoint[]): { line: string; area: string; last: { x: number; y: number } | null } {
  if (points.length < 2) return { line: "", area: "", last: null };
  const vals = points.map((p) => p.equity);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const xy = points.map((p, i) => ({
    x: PAD + (i / (points.length - 1)) * (W - 2 * PAD),
    y: PAD + (1 - (p.equity - min) / span) * (H - 2 * PAD),
  }));
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const first = xy[0] as { x: number; y: number };
  const last = xy[xy.length - 1] as { x: number; y: number };
  return { line, area: `${line} L${last.x.toFixed(1)} ${H} L${first.x.toFixed(1)} ${H} Z`, last };
}

export function EquityLine({ points }: { points: readonly EquityPoint[] }) {
  const { line, area, last } = linePath(points);
  if (!last) return null;
  const first = points[0] as EquityPoint;
  const end = points[points.length - 1] as EquityPoint;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${fmtShortDate(first.d)}: ${fmtTry(first.equity)}; bugün: ${fmtTry(end.equity)}.`} className="h-auto w-full overflow-visible">
        <path d={area} fill="var(--wash-tint)" />
        <path d={line} fill="none" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <circle cx={last.x} cy={last.y} r={4} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1.5 flex justify-between text-[12px] text-muted">
        <span>{fmtShortDate(first.d)}</span>
        <span>bugün</span>
      </figcaption>
    </figure>
  );
}
