/**
 * A squarified treemap (Bruls, Huizing, van Wijk): every rectangle's area is exactly its share of
 * the box, laid out so the rectangles stay as square as the data allows and labels fit. Pure:
 * `values` in any unit, biggest first gives the best result.
 */
export interface TreemapRect {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The worst aspect ratio in a row of `areas` laid along a side of length `side`. */
function worst(areas: readonly number[], side: number): number {
  const sum = areas.reduce((s, a) => s + a, 0);
  if (sum <= 0 || side <= 0) return Infinity;
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

export function squarify(values: readonly number[], width: number, height: number): TreemapRect[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0 || width <= 0 || height <= 0) return [];
  const scale = (width * height) / total;
  const items = values.map((v, index) => ({ index, area: Math.max(0, v) * scale })).filter((i) => i.area > 0);
  const out: TreemapRect[] = [];
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let at = 0;
  while (at < items.length) {
    const side = Math.min(w, h);
    let row: typeof items = [];
    let next = at;
    while (next < items.length) {
      const item = items[next];
      if (!item) break;
      const candidate = [...row, item];
      if (row.length > 0 && worst(candidate.map((c) => c.area), side) > worst(row.map((c) => c.area), side)) break;
      row = candidate;
      next += 1;
    }
    const rowArea = row.reduce((s, r) => s + r.area, 0);
    const horizontal = w >= h; // lay the row down the short side, at the box's left or top
    const thickness = rowArea / side;
    let cursor = 0;
    for (const r of row) {
      const along = r.area / thickness;
      out.push(horizontal ? { index: r.index, x, y: y + cursor, w: thickness, h: along } : { index: r.index, x: x + cursor, y, w: along, h: thickness });
      cursor += along;
    }
    if (horizontal) {
      x += thickness;
      w -= thickness;
    } else {
      y += thickness;
      h -= thickness;
    }
    at = next;
  }
  return out;
}
