import type { PricePoint } from "@/lib/company/company";
import { lineSummary } from "./company-words";

const W = 640;
const H = 200;
const PAD = 8;

/**
 * The daily closes as one ink line over a hatched area, the app's horizon language: the first close of
 * the period is the waterline, so above it you would be up, below it down. Pure SVG, no animation.
 */
export function PriceLine({ points }: { points: readonly PricePoint[] }) {
  if (points.length < 2) return <p className="co-empty">{lineSummary(points)}</p>;
  const closes = points.map((p) => p.close);
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const span = hi - lo || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.close).toFixed(1)}`).join(" ");
  const water = y(points[0]?.close ?? lo);
  return (
    <figure className="co-line">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={lineSummary(points)} preserveAspectRatio="none">
        <defs>
          <pattern id="co-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <path d={`${line} L${x(points.length - 1)} ${H - PAD} L${x(0)} ${H - PAD} Z`} fill="url(#co-hatch)" className="co-area" />
        <line x1={PAD} x2={W - PAD} y1={water} y2={water} className="co-water" />
        <path d={line} fill="none" className="co-stroke" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="co-line-cap">
        <span>{points[0]?.d}</span>
        <span>{points.at(-1)?.d}</span>
      </figcaption>
    </figure>
  );
}
