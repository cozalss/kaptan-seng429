// The four Rota plates (yolculuk-N, 3:4, 1200 × 1600 box), drawn in the book's ink — the crew
// plates' language (crew/STYLE.md): sumi brush contours, flat indigo washes, bare paper for light,
// one focal prop each, tiny Inter labels only, no north red (the page spends it elsewhere).
// The page shows them cropped: 4:5 on desktop (y ≈ 50–1550), 16:10 at mid widths (y ≈ 425–1175),
// 4:3 on phones (y ≈ 350–1250) — so every focal prop lives inside x 90–1110, y 430–1170.

import { text } from './kit.mjs';
import { INDIGO, INK, PAPER, brush, crewDefs, dry, g, mass, paperGround, strokes, wash } from './crew/style.mjs';

const SHEET = '#FBFAF6'; // --color-paper-panel
const BODONI = 'Bodoni Moda Display';
const TAU = Math.PI * 2;

const rot = (deg, cx, cy) => `rotate(${deg} ${cx} ${cy})`;
const circlePts = (cx, cy, rx, ry = rx, n = 28, a0 = -Math.PI / 2) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (i / n) * TAU;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });

/** A paper sheet: bright paper, an ink border brushed round it, a hard indigo shadow under it. */
function sheet(r, x, y, w, h, { shadow = 18, border = 5 } = {}) {
  const box = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const shade = box.map(([px, py]) => [px + shadow, py + shadow]);
  return [
    mass(shade, { fill: INDIGO, opacity: 0.3, sharp: true }),
    mass(box, { fill: SHEET, sharp: true }),
    brush([...box, [x, y]], { w: [border * 1.4, border, border * 0.7, border * 1.6, border * 1.4], taper: [0, 0], r, wobble: 0.3, straight: true, step: 10 }),
  ].join('');
}

/** Handwritten-looking lines of text: short brush strokes in rows. */
function textLines(r, x, y, w, rows, { gap = 34, weight = 7, opacity = 0.42, last = 0.55 } = {}) {
  const lines = [];
  for (let i = 0; i < rows; i += 1) {
    const yy = y + i * gap;
    const end = x + w * (i === rows - 1 ? last : 0.82 + r() * 0.18);
    let cx = x;
    while (cx < end - 30) {
      const word = 40 + r() * 90;
      const to = Math.min(end, cx + word);
      lines.push([[cx, yy + (r() - 0.5) * 2], [to, yy + (r() - 0.5) * 2]]);
      cx = to + 14 + r() * 8;
    }
  }
  return strokes(lines, { w: weight, taper: [0.1, 0.15], r, wobble: 0.2, opacity });
}

/** The storm of disclosures: slanting rain and an indigo dry-brush sweep high in the plate. */
function weather(r, { sweepY = 250, rain = 18 } = {}) {
  const out = [];
  out.push(dry(brush([[1260, sweepY + 20], [900, sweepY - 20], [520, sweepY + 14], [120, sweepY - 6]], { w: [120, 170, 130, 60], taper: [0.04, 0.5], r, wobble: 0.35, fill: INDIGO, opacity: 0.2 }), 0, true));
  const lines = [];
  for (let i = 0; i < rain; i += 1) {
    const x = 60 + r() * 1140;
    const y = 60 + r() * 520;
    const len = 60 + r() * 110;
    lines.push([[x, y], [x - len * 0.3, y + len]]);
  }
  out.push(g(strokes(lines, { w: 2.2, taper: [0.3, 0.5], r, fill: INDIGO }), { opacity: 0.4 }));
  return out.join('');
}

/** A low sea band at the foot of a plate (cropped away on phones). */
function footSea(r, y = 1330) {
  const crest = [];
  for (let x = -60; x <= 1260; x += 80) crest.push([x, y + Math.sin(x / 150 + 1.3) * 14 + (r() - 0.5) * 8]);
  return [
    wash([...crest, [1260, 1700], [-60, 1700]], { opacity: 0.14, edge: 0.9 }),
    dry(brush(crest, { w: 6, taper: [0.05, 0.1], r, fill: INK, opacity: 0.7 }), 0),
  ].join('');
}

/* ── I · Yakala: a slip caught out of the storm, its first sighting clocked ───────────────── */

function slipShape(r, cx, cy, w, angle, wet) {
  const h = w * 1.3;
  const body = [
    mass([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]], { fill: wet ? INDIGO : SHEET, opacity: wet ? 0.35 : 1, sharp: true }),
    brush([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2], [cx - w / 2, cy - h / 2]], { w: Math.max(2, w / 34), taper: [0, 0], r, straight: true, step: 8 }),
    strokes([0.2, 0.4, 0.58].map((k) => [[cx - w * 0.34, cy - h / 2 + h * k], [cx + w * (0.1 + r() * 0.22), cy - h / 2 + h * k]]), { w: Math.max(1.6, w / 40), taper: [0.1, 0.2], r, opacity: 0.45 }),
  ].join('');
  return g(body, { transform: rot(angle, cx, cy) });
}

function capture(r) {
  const out = [weather(r, { sweepY: 230, rain: 20 })];
  // ~350 a day: slips tumbling down a diagonal through the plate, clear of the clock.
  const clock = [520, 790, 270];
  for (let i = 0; i < 34; i += 1) {
    const t = r();
    const cx = 1180 - t * 1120 + (r() - 0.5) * 260;
    const cy = 120 + t * 1180 + (r() - 0.5) * 240;
    if (Math.hypot(cx - clock[0], cy - clock[1]) < clock[2] + 60) continue;
    out.push(slipShape(r, cx, cy, 38 + r() * 70, (r() - 0.5) * 80, r() < 0.3));
  }
  // The caught slip, tucked under the clock's rim.
  const caught = [
    sheet(r, 640, 760, 380, 470, { shadow: 16, border: 5 }),
    text(672, 822, 'ÖRNEK ENERJİ A.Ş.', { size: 26, weight: 600, fill: INK }),
    text(990, 822, 'Temsili', { size: 20, fill: INK, anchor: 'end', opacity: 0.6 }),
    textLines(r, 672, 870, 316, 5, { gap: 36 }),
    brush([[668, 1072], [700, 1180], [992, 1180], [992, 1072], [668, 1072]], { w: 5, taper: [0, 0], r, straight: true }),
    text(830, 1150, '14:05', { size: 70, weight: 600, fill: INK, anchor: 'middle', tracking: -0.01 }),
  ];
  out.push(g(caught.join(''), { transform: rot(7, 830, 1000) }));
  // The ship's clock: a heavy sumi rim, the dial in bare paper, shadow washed on the far side.
  const [cx, cy, R] = clock;
  out.push(mass(circlePts(cx + 22, cy + 24, R), { fill: INDIGO, opacity: 0.32 }));
  out.push(mass(circlePts(cx, cy, R), { fill: SHEET }));
  out.push(wash([...circlePts(cx, cy, R - 30, R - 30, 14, -0.2).slice(0, 8), [cx, cy]], { opacity: 0.16, edge: 0.6 }));
  out.push(brush(circlePts(cx, cy, R, R, 32), { w: [26, 22, 14, 10, 12, 20, 34, 40, 34, 26], taper: [0, 0], r, wobble: 0.25, step: 8 }));
  out.push(brush(circlePts(cx, cy, R - 34, R - 34, 30), { w: 3.4, taper: [0, 0], r, wobble: 0.3, opacity: 0.8 }));
  const ticks = [];
  for (let i = 0; i < 60; i += 1) {
    const a = (i / 60) * TAU - Math.PI / 2;
    const long = i % 5 === 0;
    const r0 = R - (long ? 86 : 62);
    const r1 = R - 46;
    ticks.push([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1], long]);
  }
  out.push(strokes(ticks.filter((t) => t[2]).map(([a, b]) => [a, b]), { w: 9, taper: [0.1, 0.1], r }));
  out.push(strokes(ticks.filter((t) => !t[2]).map(([a, b]) => [a, b]), { w: 3, taper: [0.1, 0.1], r, opacity: 0.7 }));
  // 14:05 → hour hand just past II, minute hand on I.
  const hand = (deg, len, w) => {
    const a = (deg * Math.PI) / 180 - Math.PI / 2;
    return brush([[cx - Math.cos(a) * 30, cy - Math.sin(a) * 30], [cx + Math.cos(a) * len * 0.55, cy + Math.sin(a) * len * 0.55], [cx + Math.cos(a) * len, cy + Math.sin(a) * len]], { w: [w * 0.6, w, w * 0.2], taper: [0, 0.35], tip: 0.1, r });
  };
  out.push(hand(62.5, 130, 24));
  out.push(hand(30, 196, 15));
  out.push(mass(circlePts(cx, cy, 16), { fill: INK }));
  out.push(text(cx, cy + 128, 'ilk görülme', { size: 26, fill: INK, anchor: 'middle', opacity: 0.75 }));
  out.push(footSea(r, 1360));
  return out.join('\n');
}

/* ── II · Anla: the reading glass lifts the figures out of the page ───────────────────────── */

function understand(r) {
  const out = [weather(r, { sweepY: 200, rain: 10 })];
  const page = [
    sheet(r, 150, 330, 760, 900, { shadow: 20, border: 5 }),
    text(196, 410, 'ÖRNEK ALTYAPI A.Ş.', { size: 34, weight: 600, fill: INK }),
    text(196, 450, 'Özel durum açıklaması · Temsili', { size: 22, fill: INK, opacity: 0.65 }),
    brush([[196, 478], [860, 476]], { w: 3, taper: [0, 0.1], r, opacity: 0.7 }),
    textLines(r, 196, 530, 660, 4),
    textLines(r, 196, 820, 660, 6),
  ];
  out.push(g(page.join(''), { transform: rot(-4, 530, 780) }));
  // The glass: paper under it, the two figures set large inside, a heavy rim and handle.
  const [lx, ly, R] = [640, 700, 238];
  const handle = [[lx + R * 0.66, ly + R * 0.7], [lx + R * 1.3, ly + R * 1.42], [lx + R * 1.72, ly + R * 1.86]];
  out.push(brush(handle.map(([x, y]) => [x + 20, y + 22]), { w: [70, 80, 70], taper: [0, 0.08], r, fill: INDIGO, opacity: 0.32 }));
  out.push(mass(circlePts(lx + 24, ly + 26, R + 18), { fill: INDIGO, opacity: 0.3 }));
  out.push(mass(circlePts(lx, ly, R), { fill: SHEET }));
  out.push(wash(circlePts(lx + 40, ly + 50, R * 0.78, R * 0.7, 16), { opacity: 0.08, edge: 0.4 }));
  const inLens = [
    text(lx, ly - 70, 'toplam bedeli', { size: 30, fill: INK, anchor: 'middle', opacity: 0.6 }),
    wash([[lx - 196, ly + 4], [lx + 200, ly - 2], [lx + 196, ly + 22], [lx - 192, ly + 26]], { opacity: 0.36, edge: 0.5 }),
    text(lx, ly + 6, '412.500.000 TL', { size: 54, weight: 600, fill: INK, anchor: 'middle', tracking: -0.01 }),
    text(lx - 64, ly + 104, 'süre', { size: 30, fill: INK, anchor: 'end', opacity: 0.6 }),
    text(lx + 40, ly + 110, '24 ay', { size: 58, weight: 600, fill: INK, anchor: 'middle' }),
    brush(circlePts(lx + 40, ly + 92, 100, 50, 22, -2.6).slice(0, 21), { w: 6, taper: [0.15, 0.3], r }),
  ];
  out.push(`<clipPath id="journey-lens"><circle cx="${lx}" cy="${ly}" r="${R - 14}"/></clipPath>`);
  out.push(g(inLens.join(''), { 'clip-path': 'url(#journey-lens)' }));
  out.push(brush(circlePts(lx, ly, R, R, 32), { w: [30, 22, 12, 10, 14, 26, 40, 46, 40, 30], taper: [0, 0], r, wobble: 0.25, step: 8 }));
  out.push(dry(brush([[lx - R * 0.55, ly - R * 0.62], [lx - R * 0.78, ly - R * 0.2]], { w: 18, taper: [0.3, 0.4], r, fill: PAPER, opacity: 0.8 }), 30));
  out.push(brush(handle, { w: [58, 66, 52], taper: [0, 0.06], r, wobble: 0.15 }));
  out.push(strokes([[handle[0], [handle[0][0] + 40, handle[0][1] + 44]]].map(([a]) => [[a[0] + 18, a[1] + 32], [a[0] + 52, a[1] - 2]]), { w: 6, taper: [0, 0], r, fill: PAPER, opacity: 0.7 }));
  // The structured tag the reader fills in, tied to the page.
  const tag = [
    sheet(r, 120, 1030, 400, 230, { shadow: 14, border: 4 }),
    text(150, 1082, 'Tür', { size: 26, fill: INK, opacity: 0.65 }),
    text(300, 1082, 'E3', { size: 30, weight: 600, fill: INK, family: 'Consolas, monospace' }),
    brush([[150, 1102], [490, 1100]], { w: 2, taper: [0, 0], r, opacity: 0.4 }),
    text(150, 1150, 'Tutar', { size: 26, fill: INK, opacity: 0.65 }),
    text(300, 1150, '412,5 mn TL', { size: 30, weight: 600, fill: INK }),
    brush([[150, 1170], [490, 1168]], { w: 2, taper: [0, 0], r, opacity: 0.4 }),
    text(150, 1218, 'Süre', { size: 26, fill: INK, opacity: 0.65 }),
    text(300, 1218, '24 ay', { size: 30, weight: 600, fill: INK }),
  ];
  out.push(g(tag.join(''), { transform: rot(3, 320, 1145) }));
  out.push(brush([[520, 1080], [600, 1010], [640, 960]], { w: 3, taper: [0.1, 0.1], r, opacity: 0.8 }));
  out.push(footSea(r, 1380));
  return out.join('\n');
}

/* ── III · Kanıtla: past events fanned on the chart, the dividers taking the median ────────── */

function prove(r) {
  const out = [weather(r, { sweepY: 210, rain: 8 })];
  const [x0, x1, y0] = [250, 990, 980];
  const chart = [
    sheet(r, 120, 370, 960, 820, { shadow: 20, border: 5 }),
    text(160, 440, 'Benzer geçmiş olaylar', { size: 32, weight: 600, fill: INK }),
    text(160, 480, 'getirileri görülmeden seçilir · istatistiği kod hesaplar', { size: 22, fill: INK, opacity: 0.65 }),
    text(1040, 440, 'Temsili', { size: 22, fill: INK, anchor: 'end', opacity: 0.6 }),
  ];
  // faint ruled grid
  const grid = [];
  for (let x = x0; x <= x1; x += 74) grid.push([[x, 540], [x, 1130]]);
  for (let y = 560; y <= 1120; y += 70) grid.push([[180, y], [1040, y]]);
  chart.push(g(strokes(grid, { w: 1.4, taper: [0, 0], r, opacity: 0.12 }), {}));
  out.push(g(chart.join(''), { transform: rot(-1.5, 600, 780) }));
  // the fan
  const n = 16;
  const xs = Array.from({ length: n }, (_, i) => x0 + ((x1 - x0) * i) / (n - 1));
  const gauss = () => (r() + r() + r() - 1.5) / 1.5;
  const curves = Array.from({ length: 18 }, () => {
    const c = [0];
    for (let i = 1; i < n; i += 1) c.push(c[i - 1] + 0.0045 + gauss() * 0.009);
    return c;
  });
  const q = (i, p) => {
    const v = curves.map((c) => c[i]).sort((a, b) => a - b);
    return v[Math.round(p * (v.length - 1))];
  };
  const toY = (v) => y0 - v * 4200;
  const band = [...xs.map((x, i) => [x, toY(q(i, 0.82))]), ...xs.map((x, i) => [x, toY(q(i, 0.18))]).reverse()];
  out.push(wash(band, { opacity: 0.3, edge: 0.6, sharp: true }));
  curves.forEach((c) => out.push(brush(xs.map((x, i) => [x, toY(c[i])]), { w: 3, taper: [0.02, 0.2], r, opacity: 0.45 })));
  const median = xs.map((x, i) => [x, toY(q(i, 0.5))]);
  out.push(brush(median, { w: 16, taper: [0.05, 0.08], r, wobble: 0.2 }));
  const end = median[n - 1];
  out.push(mass(circlePts(end[0], end[1], 14), { fill: INK }));
  out.push(brush([[x0 - 50, y0], [x1 + 40, y0 - 2]], { w: 6, taper: [0, 0.05], r }));
  out.push(strokes(Array.from({ length: 8 }, (_, i) => [[x0, 560 + i * 72], [x0, 600 + i * 72]]), { w: 4, taper: [0.1, 0.1], r, opacity: 0.7 }));
  out.push(text(x0 - 14, y0 + 50, 't = 0', { size: 28, fill: INK, anchor: 'end' }));
  out.push(text(end[0] + 6, end[1] + 58, 'medyan', { size: 28, weight: 600, fill: INK, anchor: 'end' }));
  // the dividers: a hinge high on the chart, one point on t = 0, one on the median's end
  const hinge = [760, 470];
  const leg = (to, w) => brush([hinge, [(hinge[0] + to[0]) / 2, (hinge[1] + to[1]) / 2], to], { w: [w, w * 0.8, w * 0.15], taper: [0, 0.3], tip: 0.08, r });
  out.push(brush([[hinge[0] + 18, hinge[1] + 20], [x0 + 18, y0 + 20]], { w: 28, taper: [0, 0.3], r, fill: INDIGO, opacity: 0.25 }));
  out.push(leg([x0 + 4, y0 - 4], 26));
  out.push(leg([end[0], end[1] + 4], 22));
  out.push(dry(brush([[hinge[0] - 6, hinge[1] + 30], [x0 + 60, y0 - 60]], { w: 6, taper: [0.2, 0.4], r, fill: PAPER, opacity: 0.6 }), 0));
  out.push(mass(circlePts(hinge[0], hinge[1], 30), { fill: INK }));
  out.push(mass(circlePts(hinge[0], hinge[1], 11), { fill: SHEET }));
  out.push(brush([[hinge[0], hinge[1] - 28], [hinge[0] + 2, hinge[1] - 92]], { w: [22, 18], taper: [0, 0.1], r }));
  out.push(footSea(r, 1370));
  return out.join('\n');
}

/* ── IV · Onayla: the human signs the slip; the record is sealed into the chain ─────────────── */

function signature(r, x, y) {
  const pts = [[x - 10, y + 30], [x + 20, y - 70], [x + 36, y - 84], [x + 30, y - 24], [x + 20, y + 20]];
  for (let t = 0.6; t < 5.2 * Math.PI; t += 0.42) {
    const k = 1 - t / (7 * Math.PI);
    pts.push([x + 50 + 15 * t - 36 * k * Math.sin(t), y - 8 - 44 * k * Math.cos(t) + (r() - 0.5) * 3]);
  }
  const [ex, ey] = pts[pts.length - 1];
  pts.push([ex + 40, ey - 34]);
  return [
    brush(pts, { w: 9, taper: [0.05, 0.2], r, wobble: 0.45, step: 4 }),
    brush([[x + 10, y + 50], [x + 150, y + 34], [x + 330, y + 38], [ex + 70, y + 12]], { w: 5, taper: [0.1, 0.4], r }),
  ].join('');
}

function approve(r) {
  const out = [weather(r, { sweepY: 190, rain: 6 })];
  const slip = [
    sheet(r, 190, 320, 820, 760, { shadow: 22, border: 5 }),
    text(236, 392, 'Onay fişi', { size: 34, weight: 600, fill: INK }),
    text(964, 392, 'Temsili', { size: 22, fill: INK, anchor: 'end', opacity: 0.6 }),
    text(236, 488, 'ORNEK · E2 önerisi', { size: 66, family: BODONI, fill: INK }),
    brush([[236, 520], [964, 518]], { w: 3, taper: [0, 0.1], r, opacity: 0.8 }),
  ];
  const rows = [['Risk kapısı', 'R01–R16'], ['Boyut', 'küçültüldü'], ['Süre sonu', 'ertesi seans']];
  rows.forEach(([k, v], i) => {
    const y = 580 + i * 62;
    slip.push(text(236, y, k, { size: 28, fill: INK, opacity: 0.65 }));
    slip.push(text(500, y, v, { size: 30, weight: 600, fill: INK, family: i === 0 ? 'Consolas, monospace' : undefined }));
    slip.push(brush([[236, y + 20], [964, y + 18]], { w: 1.8, taper: [0, 0], r, opacity: 0.35 }));
  });
  // the hour stamp: the one fixed time on the chart
  slip.push(brush([[690, 610], [960, 610], [960, 740], [690, 740], [690, 610]], { w: 6, taper: [0, 0], r, straight: true }));
  slip.push(text(825, 702, '09:50', { size: 78, weight: 600, fill: INK, anchor: 'middle', tracking: -0.01 }));
  slip.push(brush([[236, 1000], [964, 998]], { w: 3, taper: [0, 0.05], r }));
  slip.push(text(236, 1040, 'İnsan onayı · imza', { size: 24, fill: INK, opacity: 0.65 }));
  slip.push(signature(r, 290, 930));
  out.push(g(slip.join(''), { transform: rot(-2.5, 600, 700) }));
  // the pen, laid across after signing
  const pen = [[1150, 1210], [960, 1060], [820, 948]];
  out.push(brush(pen.map(([x, y]) => [x + 16, y + 22]), { w: [64, 58, 30], taper: [0, 0.1], r, fill: INDIGO, opacity: 0.3 }));
  out.push(brush(pen, { w: [60, 56, 30], taper: [0, 0.12], tip: 0.2, r, wobble: 0.12 }));
  out.push(strokes([[[1040, 1124], [1010, 1160]], [[1056, 1137], [1026, 1172]]].map((s) => s), { w: 7, taper: [0, 0], r, fill: PAPER, opacity: 0.75 }));
  out.push(dry(brush([[1120, 1176], [900, 1000]], { w: 8, taper: [0.2, 0.3], r, fill: PAPER, opacity: 0.45 }), 38));
  out.push(mass([[826, 936], [806, 944], [790, 922], [812, 914]], { fill: INK, sharp: true }));
  // the hash chain: five inked links
  const links = [];
  for (let i = 0; i < 5; i += 1) {
    const cx = 330 + i * 136;
    const cy = 1250 + Math.sin(i * 1.3) * 6;
    links.push(i % 2 === 0
      ? brush(circlePts(cx, cy, 88, 40, 22), { w: [10, 7, 12, 8], taper: [0, 0], r })
      : brush(circlePts(cx, cy, 80, 22, 22), { w: [7, 10, 6, 9], taper: [0, 0], r }));
  }
  out.push(links.join(''));
  out.push(text(600, 1352, 'Hash zincirli denetim kaydı', { size: 28, fill: INK, anchor: 'middle', opacity: 0.75 }));
  return out.join('\n');
}

/** Wraps a plate's drawing in the shared ground (paper, washed sky, filters). */
function plate(draw) {
  return (r) => [crewDefs(), paperGround(), draw(r)].join('\n');
}

export const JOURNEY_PLATES = Object.freeze([
  { title: 'Yakala', draw: plate(capture) },
  { title: 'Anla', draw: plate(understand) },
  { title: 'Kanıtla', draw: plate(prove) },
  { title: 'Onayla', draw: plate(approve) },
]);
