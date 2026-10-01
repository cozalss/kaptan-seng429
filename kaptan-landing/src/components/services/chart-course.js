// The course plotted on the chart spread (Bölüm 2's closing double page). One source of truth for
// two consumers: the raster chart (scripts/kaptan-visuals/chart.mjs carves a deep channel along it
// and keeps the soundings clear of the legend) and the live ink layer drawn over the spread
// (chart-spread.js). Coordinates are chart units in a 2400 × 1600 box (3:2, the spread's aspect).

export const CHART_BOX = Object.freeze([2400, 1600]);

/** Departure (bottom left) to landfall (top right), through four waypoints. */
export const COURSE = Object.freeze([
  Object.freeze([200, 1440]),
  Object.freeze([620, 1300]),
  Object.freeze([1020, 1170]),
  Object.freeze([1290, 880]),
  Object.freeze([1660, 590]),
  Object.freeze([2200, 470]),
]);

/** The printed legend (cartouche) sits on the land in the top-left corner of the left page. */
export const LEGEND = Object.freeze({ x: 130, y: 130, w: 620, h: 290 });

const round = (n) => (Math.round(n * 100) / 100).toString();

/** Compass heading (0–359°, clockwise from north, y down) from point `a` to point `b`. */
export function heading([ax, ay], [bx, by]) {
  const deg = (Math.atan2(bx - ax, -(by - ay)) * 180) / Math.PI;
  return Math.round((deg + 360) % 360) % 360;
}

/** Smooth path data through the points (Catmull-Rom → cubic Bézier), as the chart draws it. */
export function smoothPath(points) {
  if (points.length < 3) return points.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`).join(' ');
  const p = [points[0], ...points, points[points.length - 1]];
  let d = `M${round(p[1][0])} ${round(p[1][1])}`;
  for (let i = 1; i < p.length - 2; i += 1) {
    const [x0, y0] = p[i - 1];
    const [x1, y1] = p[i];
    const [x2, y2] = p[i + 1];
    const [x3, y3] = p[i + 2];
    d += ` C${round(x1 + (x2 - x0) / 6)} ${round(y1 + (y2 - y0) / 6)} ${round(x2 - (x3 - x1) / 6)} ${round(y2 - (y3 - y1) / 6)} ${round(x2)} ${round(y2)}`;
  }
  return d;
}

/**
 * The inner waypoints with the heading of the leg that leaves them ("042°") and `at`, the share
 * of the course (0–1, by straight-leg length) at which the pen reaches them.
 */
export function waypoints(points = COURSE) {
  const legs = points.slice(1).map((pt, i) => Math.hypot(pt[0] - points[i][0], pt[1] - points[i][1]));
  const total = legs.reduce((sum, len) => sum + len, 0) || 1;
  let run = 0;
  return points.slice(1, -1).map((pt, i) => {
    run += legs[i];
    return { x: pt[0], y: pt[1], at: run / total, label: `${String(heading(pt, points[i + 2])).padStart(3, '0')}°` };
  });
}

// The hero's boat (index.html, HERO block), redrawn at chart scale: its hull bottom centre sits on
// the local origin, so the boat rides the course line.
const BOAT_PATHS = [
  ['fill', 'M76 26 C 64 48 52 70 40 88 L 76 88 Z'],
  ['fill', 'M81 22 C 100 40 116 66 124 86 L 82 88 Z'],
  ['fill', 'M14 92 C 30 97 110 99 148 88 C 140 101 124 108 96 110 L 52 110 C 34 108 22 102 14 92 Z'],
  ['ink', 'M14 92 C 30 97 110 99 148 88 C 140 101 124 108 96 110 L 52 110 C 34 108 22 102 14 92 Z'],
  ['ink', 'M78 95 L 80 17'],
  ['ink', 'M81 22 C 100 40 116 66 124 86 L 82 88'],
  ['ink', 'M76 26 C 64 48 52 70 40 88 L 76 88'],
  ['ink', 'M83 42 L 107 45 M83 60 L 116 63 M83 76 L 121 78'],
  ['flag', 'M80 17 L 94 21 L 80 25 Z'],
];
const BOAT_SCALE = 1.1;
const BOAT_ANCHOR = [80, 104];
const MARK_R = 16;

/**
 * The live ink layer of the spread (inner markup of the 2400 × 1600 <svg data-spread-ink>): the
 * course, a departure tick, the waypoints with their headings, the landfall ring and the boat.
 * Written into index.html once (so it shows without JS); a test keeps the two in sync.
 */
export function inkLayerMarkup(points = COURSE) {
  const [sx, sy] = points[0];
  const [ex, ey] = points[points.length - 1];
  const marks = waypoints(points).map(({ x, y, at, label }) =>
    `<g class="spread__mark" data-spread-mark data-at="${round(at)}"><circle cx="${x}" cy="${y}" r="${MARK_R}" /><circle class="spread__dot" cx="${x}" cy="${y}" r="4.5" /><text x="${x - 28}" y="${y - 22}" text-anchor="end">${label}</text></g>`,
  );
  const boat = BOAT_PATHS.map(([kind, d]) => `<path class="spread__boat-${kind}" d="${d}" />`).join('');
  const [ax, ay] = BOAT_ANCHOR;
  return [
    `<path class="spread__course" data-spread-course d="${smoothPath(points)}" />`,
    `<g class="spread__mark spread__mark--start" data-spread-mark data-at="0"><path d="M${sx - 18} ${sy} H${sx + 18} M${sx} ${sy - 18} V${sy + 18}" /></g>`,
    ...marks,
    `<g class="spread__mark spread__mark--landfall" data-spread-mark data-at="1"><circle class="spread__ring" data-spread-ring cx="${ex}" cy="${ey}" r="30" /><circle class="spread__dot" cx="${ex}" cy="${ey}" r="9" /></g>`,
    `<g class="spread__boat" data-spread-boat transform="translate(${ex} ${ey})"><g transform="scale(${BOAT_SCALE}) translate(${-ax} ${-ay})">${boat}</g></g>`,
  ].join('\n');
}
