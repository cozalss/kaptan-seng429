import { area, curveMonotoneX, line } from "d3-shape";

type Point = readonly [number, number];

/** One decimal is plenty for a screen and keeps the path short (the types lack d3's `.digits`). */
const short = (d: string | null): string => (d ?? "").replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10));

const smoothLine = line<Point>()
  .x((p) => p[0])
  .y((p) => p[1])
  .curve(curveMonotoneX);

/**
 * A smooth money line through the points. Monotone in x, so it never overshoots a day's real
 * value: a peak in the drawing is a peak in the data. Empty under two points.
 */
export function smoothPath(points: readonly Point[]): string {
  if (points.length < 2) return "";
  return short(smoothLine(points as Point[]));
}

/** The same smooth line, closed down (or up) to a flat baseline at `baseY`: the wash under a line. */
export function smoothArea(points: readonly Point[], baseY: number): string {
  if (points.length < 2) return "";
  const fill = area<Point>()
    .x((p) => p[0])
    .y0(baseY)
    .y1((p) => p[1])
    .curve(curveMonotoneX);
  return short(fill(points as Point[]));
}
