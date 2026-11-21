"use client";

import type { PricePoint } from "@/lib/company/company";
import { axisEnds, crossesYear, fmtChartDay } from "@/lib/format";
import { lineSummary } from "./company-words";
import { CHART_PAD as PAD, CHART_W as W, ChartFrame, chartX } from "./chart-frame";

const H = 200;

const price = (n: number) => `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

/**
 * The daily closes as one ink line over a hatched area, the app's horizon language: the first close of
 * the period is the waterline, so above it you would be up, below it down. The scale is read off three
 * labels (the period's high, low and first close); a pointer over the plot shows that day's close.
 */
export function PriceLine({ points }: { points: readonly PricePoint[] }) {
  if (points.length < 2) return <p className="co-empty">{lineSummary(points)}</p>;
  const closes = points.map((p) => p.close);
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const span = hi - lo || 1;
  const x = (i: number) => chartX(i, points.length);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.close).toFixed(1)}`).join(" ");
  const first = points[0]!;
  const last = points.at(-1)!;
  const water = y(first.close);
  const yearly = crossesYear(first.d, last.d);
  const [from, to] = axisEnds(first.d, last.d);
  return (
    <figure className="co-line">
      <ChartFrame
        h={H}
        count={points.length}
        ticks={[
          { y: y(hi), label: price(hi) },
          { y: y(lo), label: price(lo) },
          { y: water, label: `Başta ${price(first.close)}`, strong: true },
        ]}
        ends={[{ y: y(last.close), series: "a" }]}
        marksAt={(i) => [{ y: y(points[i]!.close), series: "a" }]}
        tipAt={(i) => (
          <>
            <b>{price(points[i]!.close)}</b>
            <span>{fmtChartDay(points[i]!.d, yearly)}</span>
          </>
        )}
      >
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={lineSummary(points)} preserveAspectRatio="none">
          <defs>
            <pattern id="co-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <line x1={PAD} x2={W - PAD} y1={y(hi)} y2={y(hi)} className="co-grid" vectorEffect="non-scaling-stroke" />
          <line x1={PAD} x2={W - PAD} y1={y(lo)} y2={y(lo)} className="co-grid" vectorEffect="non-scaling-stroke" />
          <path d={`${line} L${x(points.length - 1)} ${H - PAD} L${x(0)} ${H - PAD} Z`} fill="url(#co-hatch)" className="co-area" />
          <line x1={PAD} x2={W - PAD} y1={water} y2={water} className="co-water" vectorEffect="non-scaling-stroke" />
          <path d={line} fill="none" className="co-stroke" vectorEffect="non-scaling-stroke" />
        </svg>
      </ChartFrame>
      <figcaption className="co-line-cap">
        <span>{from}</span>
        <span>{to}</span>
      </figcaption>
    </figure>
  );
}
