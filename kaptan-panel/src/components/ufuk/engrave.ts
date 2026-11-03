/**
 * The engraver's hand: pure geometry for the sea's wave strokes and the money line's hatching.
 * Deterministic (the same size gives the same drawing), real pixels, no DOM.
 */

/** A small seeded PRNG (mulberry32): a repaint never reshuffles the engraving. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f1 = (n: number) => n.toFixed(1);

/** One lens-shaped wave stroke: swells in the middle, tapers to nothing at both ends. */
function lens(x: number, y: number, length: number, thick: number, lift: number): string {
  const mid = x + length / 2;
  const end = x + length;
  return `M${f1(x)} ${f1(y)}Q${f1(mid)} ${f1(y - lift - thick)} ${f1(end)} ${f1(y)}Q${f1(mid)} ${f1(y - lift + thick)} ${f1(x)} ${f1(y)}Z`;
}

const ROW_GROWTH = 1.34;
const FIRST_ROW_GAP = 7;

/**
 * Woodcut water seen in perspective: fine, tight strokes at the horizon, longer, heavier, sparser
 * ones toward the viewer. `top` is the horizon's y; fills the box down to `height`.
 */
export function seaStrokes(width: number, height: number, top = 0, seed = 7): string {
  const out: string[] = [];
  let y = top + FIRST_ROW_GAP;
  let gap = FIRST_ROW_GAP;
  for (let row = 0; y < height + 8; row += 1) {
    const rand = random(seed * 131 + row * 17);
    const depth = Math.min(1, (y - top) / Math.max(1, 320));
    const length = 26 + depth * 150;
    const space = 22 + depth * 150;
    const thick = 0.45 + depth * 1.05;
    let x = -rand() * (length + space);
    while (x < width) {
      const l = length * (0.55 + rand() * 0.75);
      out.push(lens(x, y + (rand() - 0.5) * gap * 0.5, l, thick, 1 + depth * 3.5));
      x += l + space * (0.45 + rand() * 1.05);
    }
    gap = Math.min(gap * ROW_GROWTH, 46);
    y += gap;
  }
  return out.join("");
}

export interface HatchRun {
  x: number;
  /** The money line at x. */
  y: number;
}

const HATCH_STEP = 4.5;
/** How far each stroke of a four-stroke group reaches from the line toward the waterline. */
const REACH = [1, 0.34, 0.66, 0.34] as const;
const SLANT = 0.28;

/** Interpolate the polyline at x. */
function yAt(line: readonly HatchRun[], x: number): number | null {
  const first = line[0];
  const last = line[line.length - 1];
  if (!first || !last || x < first.x || x > last.x) return null;
  let lo = 0;
  let hi = line.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((line[mid]?.x ?? 0) <= x) lo = mid;
    else hi = mid;
  }
  const a = line[lo];
  const b = line[hi];
  if (!a || !b) return null;
  return a.y + ((x - a.x) / Math.max(1e-6, b.x - a.x)) * (b.y - a.y);
}

/**
 * The hatching between the money line and the waterline. Above the water: one slant, dense at the
 * line and thinning toward the waterline, so tone comes from line density, not from a gradient.
 * Below the water: the same cross-hatched, so "down" differs from "up" with no colour at all.
 */
export function moneyHatch(line: readonly HatchRun[], waterY: number): { up: string; down: string } {
  const rand = random(29);
  const first = line[0];
  const last = line[line.length - 1];
  if (!first || !last) return { up: "", down: "" };
  const up: string[] = [];
  const down: string[] = [];
  let i = 0;
  for (let x = first.x; x <= last.x; x += HATCH_STEP, i += 1) {
    const y = yAt(line, x);
    const wobble = (rand() - 0.5) * 0.9;
    if (y === null) continue;
    const span = waterY - y;
    if (Math.abs(span) < 2.5) continue;
    const reach = REACH[i % REACH.length] ?? 1;
    const end = y + span * Math.min(1, reach + (rand() - 0.5) * 0.08);
    const dx = (end - y) * SLANT;
    const stroke = `M${f1(x + wobble)} ${f1(y)}L${f1(x + wobble - Math.abs(dx))} ${f1(end)}`;
    if (span > 0) {
      up.push(stroke);
    } else {
      down.push(stroke, `M${f1(x + wobble)} ${f1(y)}L${f1(x + wobble + Math.abs(dx))} ${f1(end)}`);
    }
  }
  return { up: up.join(""), down: down.join("") };
}

/** The sea's top edge: the money line where it sank below the water, else the waterline. */
export function seaSurface(line: readonly HatchRun[], waterY: number, width: number, height: number): string {
  const pts: string[] = [];
  const first = line[0];
  const last = line[line.length - 1];
  if (!first || !last) return `M0 ${f1(waterY)}H${f1(width)}V${f1(height)}H0Z`;
  pts.push(`M0 ${f1(Math.max(first.y, waterY))}`);
  for (let i = 0; i < line.length; i += 1) {
    const p = line[i];
    const prev = line[i - 1];
    if (!p) continue;
    if (prev && (prev.y - waterY) * (p.y - waterY) < 0) {
      const t = (waterY - prev.y) / (p.y - prev.y);
      pts.push(`L${f1(prev.x + t * (p.x - prev.x))} ${f1(waterY)}`);
    }
    pts.push(`L${f1(p.x)} ${f1(Math.max(p.y, waterY))}`);
  }
  pts.push(`L${f1(width)} ${f1(Math.max(last.y, waterY))}V${f1(height)}H0Z`);
  return pts.join("");
}
