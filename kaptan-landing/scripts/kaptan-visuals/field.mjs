// Scalar fields and contour extraction for the nautical chart: seeded value-noise fBm and
// marching squares joined into polylines (closed loops when the field is water at its border).

/** Deterministic lattice hash in [0, 1). */
function hash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal noise in roughly [-1, 1]. */
export function fbm(x, y, seed, octaves = 5) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * (valueNoise(x * freq, y * freq, seed + o * 101) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Samples `fn(x, y)` on a grid covering [x0, x0 + cols·step] × [y0, y0 + rows·step]. */
export function sampleGrid(fn, { x0, y0, cols, rows, step }) {
  const values = new Float64Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) values[j * (cols + 1) + i] = fn(x0 + i * step, y0 + j * step);
  }
  return { values, x0, y0, cols, rows, step };
}

/**
 * Iso-lines of the grid at `level`, as arrays of [x, y] points. Segments are joined through the
 * cell edges they share, so a contour that never meets the grid border comes back closed.
 */
export function contours(grid, level) {
  const { values, x0, y0, cols, rows, step } = grid;
  const v = (i, j) => values[j * (cols + 1) + i];
  const point = new Map();
  const edgePoint = (key, ax, ay, av, bx, by, bv) => {
    if (!point.has(key)) {
      const t = (level - av) / (bv - av);
      point.set(key, [x0 + (ax + (bx - ax) * t) * step, y0 + (ay + (by - ay) * t) * step]);
    }
    return key;
  };
  const links = new Map();
  const link = (a, b) => {
    if (!links.has(a)) links.set(a, []);
    if (!links.has(b)) links.set(b, []);
    links.get(a).push(b);
    links.get(b).push(a);
  };
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i + 1, j + 1);
      const d = v(i, j + 1);
      const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const top = () => edgePoint(`h${i},${j}`, i, j, a, i + 1, j, b);
      const right = () => edgePoint(`v${i + 1},${j}`, i + 1, j, b, i + 1, j + 1, c);
      const bottom = () => edgePoint(`h${i},${j + 1}`, i, j + 1, d, i + 1, j + 1, c);
      const left = () => edgePoint(`v${i},${j}`, i, j, a, i, j + 1, d);
      const center = (a + b + c + d) / 4 > level;
      switch (idx) {
        case 1: case 14: link(left(), bottom()); break;
        case 2: case 13: link(bottom(), right()); break;
        case 3: case 12: link(left(), right()); break;
        case 4: case 11: link(top(), right()); break;
        case 6: case 9: link(top(), bottom()); break;
        case 7: case 8: link(left(), top()); break;
        case 5:
          if (center) { link(left(), top()); link(bottom(), right()); } else { link(left(), bottom()); link(top(), right()); }
          break;
        case 10:
          if (center) { link(left(), bottom()); link(top(), right()); } else { link(left(), top()); link(bottom(), right()); }
          break;
        default: break;
      }
    }
  }
  const seen = new Set();
  const lines = [];
  const walk = (startKey) => {
    const keys = [startKey];
    seen.add(startKey);
    let current = startKey;
    for (;;) {
      const next = (links.get(current) ?? []).find((k) => !seen.has(k));
      if (!next) break;
      seen.add(next);
      keys.push(next);
      current = next;
    }
    return keys;
  };
  // open lines first (ends have a single link), then loops
  for (const [key, nb] of links) if (!seen.has(key) && nb.length === 1) lines.push({ keys: walk(key), closed: false });
  for (const key of links.keys()) if (!seen.has(key)) lines.push({ keys: walk(key), closed: true });
  return lines.map(({ keys, closed }) => ({ points: keys.map((k) => point.get(k)), closed }));
}

/** Drops every other point on long lines (keeps SVG light; the grid is finer than needed). */
export function thin(points, every = 2) {
  if (points.length < 8) return points;
  return points.filter((_, i) => i % every === 0 || i === points.length - 1);
}
