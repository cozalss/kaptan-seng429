// Render → grain → encode pipeline for the KAPtan visuals. Imported only by
// scripts/build-kaptan-visuals.mjs, after fontconfig has been pointed at the site fonts.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { svgDoc, rng } from './kit.mjs';

const KB = 1024;
const MIN_AVIF_QUALITY = 30;
const QUALITY_STEP = 4;
const DEFAULT_QUALITY = Object.freeze({ avif: 52, webp: 74, jpg: 78 });
const FORMATS = Object.freeze(['avif', 'webp', 'jpg']);
const ENCODERS = Object.freeze({
  avif: (image, quality) => image.avif({ quality, effort: 6, chromaSubsampling: '4:2:0' }),
  webp: (image, quality) => image.webp({ quality, effort: 6, smartSubsample: true }),
  jpg: (image, quality) => image.jpeg({ quality, mozjpeg: true, progressive: true }),
});

const CARD_BOX = [1200, 1600];
const CARD_WIDTHS = [400, 600, 800];
const DETAIL_WIDTHS = [400, 600];
const JOURNEY_WIDTHS = [600, 900, 1200, 1600, 2000];
const CHART_WIDTHS = [1280, 1920];
const AVIF_BUDGET = Object.freeze({ yolculuk: 150 * KB, harita: 200 * KB });
const GRAIN = 4.2; // ± levels of luminance noise (triangular), applied at the output size

/** Deterministic paper grain on a raw RGB(A) buffer (luminance only, so no colour noise). */
function addGrain(data, channels, seed) {
  const r = rng(seed);
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += channels) {
    const n = (r() + r() - 1) * GRAIN;
    for (let c = 0; c < 3; c += 1) out[i + c] = Math.max(0, Math.min(255, Math.round(out[i + c] + n)));
  }
  return out;
}

/** SVG → raster at the master size → per-width resize + grain → { width: sharp instance }. */
async function rasterise(svg, masterWidth, widths, seed) {
  const master = await sharp(Buffer.from(svg)).flatten({ background: '#F2F1EC' }).removeAlpha().png().toBuffer();
  const results = new Map();
  for (const width of widths) {
    const resized = width === masterWidth ? sharp(master) : sharp(master).resize({ width, kernel: 'lanczos3' });
    const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
    const grained = addGrain(data, info.channels, seed + width);
    results.set(width, () => sharp(grained, { raw: { width: info.width, height: info.height, channels: info.channels } }));
  }
  return results;
}

async function encodeAll(outDir, name, frames, budget, log) {
  for (const [width, image] of frames) {
    for (const ext of FORMATS) {
      let quality = DEFAULT_QUALITY[ext];
      let buffer = await ENCODERS[ext](image(), quality).toBuffer();
      while (ext === 'avif' && budget && buffer.length > budget && quality - QUALITY_STEP >= MIN_AVIF_QUALITY) {
        quality -= QUALITY_STEP;
        buffer = await ENCODERS[ext](image(), quality).toBuffer();
      }
      const file = path.join(outDir, `${name}-${width}.${ext}`);
      await writeFile(file, buffer);
      log(`  + ${name}-${width}.${ext}  ${(buffer.length / KB).toFixed(1)} KB  q${quality}`);
    }
  }
}

/** Detail frame: a 3:4 window of the plate, `zoom`× tighter, centred on `focus` (kept inside). */
function detailView({ x, y, zoom }) {
  const [bw, bh] = CARD_BOX;
  const w = bw / zoom;
  const h = bh / zoom;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  return [clamp(x * bw - w / 2, 0, bw - w), clamp(y * bh - h / 2, 0, bh - h), w, h];
}

async function buildAgents(ctx) {
  if (!Array.from({ length: 8 }, (_, i) => `ajan-${i + 1}`).some((n) => ctx.wants(n))) return;
  const { AGENT_PLATES } = await import('./agents.mjs');
  for (const [index, plate] of AGENT_PLATES.entries()) {
    const n = index + 1;
    const name = `ajan-${n}`;
    if (!ctx.wants(name)) continue;
    const body = plate.draw(rng(1000 + n));
    const caption = { left: `No. ${String(n).padStart(2, '0')}  ·  ${plate.title}`, right: 'Temsili' };
    const svg = svgDoc({ box: CARD_BOX, px: [1200, 1600], body, caption });
    ctx.keep(name, svg);
    await encodeAll(ctx.outDir, name, await rasterise(svg, 1200, CARD_WIDTHS, 17 * n), null, ctx.log);
    const view = detailView(plate.focus);
    const detailSvg = svgDoc({ box: CARD_BOX, view, px: [900, 1200], body }); // no caption: a crop would cut it
    await encodeAll(ctx.outDir, `${name}-detail`, await rasterise(detailSvg, 900, DETAIL_WIDTHS, 31 * n), null, ctx.log);
  }
}

async function buildJourney(ctx) {
  if (![1, 2, 3, 4].some((n) => ctx.wants(`yolculuk-${n}`))) return;
  const { JOURNEY_PLATES } = await import('./journey.mjs');
  for (const [index, plate] of JOURNEY_PLATES.entries()) {
    const n = index + 1;
    const name = `yolculuk-${n}`;
    if (!ctx.wants(name)) continue;
    const svg = svgDoc({ box: CARD_BOX, px: [2000, 2667], body: plate.draw(rng(2000 + n)) });
    ctx.keep(name, svg);
    await encodeAll(ctx.outDir, name, await rasterise(svg, 2000, JOURNEY_WIDTHS, 53 * n), AVIF_BUDGET.yolculuk, ctx.log);
  }
}

async function buildChart(ctx) {
  if (!ctx.wants('harita')) return;
  const { chartSvg } = await import('./chart.mjs');
  const svg = chartSvg({ px: [2400, 1600] });
  const frames = await rasterise(svg, 2400, CHART_WIDTHS, 71);
  await encodeAll(ctx.outDir, 'harita', frames, AVIF_BUDGET.harita, ctx.log);
}

async function buildOg(ctx) {
  if (!ctx.wants('og')) return;
  const { ogSvg } = await import('./og.mjs');
  const svg = ogSvg({ px: [1280, 853] });
  ctx.keep('og', svg);
  const frames = await rasterise(svg, 1280, [1280], 89);
  const buffer = await ENCODERS.jpg(frames.get(1280)(), 84).toBuffer();
  await writeFile(path.join(ctx.outDir, 'og-1280.jpg'), buffer);
  ctx.log(`  + og-1280.jpg  ${(buffer.length / KB).toFixed(1)} KB`);
}

/** Contact sheet of every card and journey plate (QA only, not shipped). */
async function contactSheet(root, outDir, log) {
  const names = [...Array.from({ length: 8 }, (_, i) => `ajan-${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `ajan-${i + 1}-detail`)];
  const journey = Array.from({ length: 4 }, (_, i) => `yolculuk-${i + 1}`);
  const cell = { w: 300, h: 400, gap: 24 };
  const cols = 8;
  const rows = 3;
  const width = cols * cell.w + (cols + 1) * cell.gap;
  const height = rows * cell.h + (rows + 1) * cell.gap;
  const tiles = [];
  const place = async (file, col, row) => {
    const input = await sharp(path.join(outDir, file)).resize(cell.w, cell.h, { fit: 'cover' }).toBuffer();
    tiles.push({ input, left: cell.gap + col * (cell.w + cell.gap), top: cell.gap + row * (cell.h + cell.gap) });
  };
  for (const [i, name] of names.entries()) await place(`${name}-400.jpg`, i % 8, Math.floor(i / 8));
  for (const [i, name] of journey.entries()) await place(`${name}-600.jpg`, i * 2, 2);
  // odd columns: the same plate as the ring window shows it
  const ring = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell.w}" height="${cell.h}"><ellipse cx="${cell.w / 2}" cy="${cell.h / 2}" rx="${cell.w / 2 - 4}" ry="${(cell.w / 2 - 4) * (55 / 53)}" fill="#000"/></svg>`);
  for (const [i, name] of journey.entries()) {
    const masked = await sharp(path.join(outDir, `${name}-600.jpg`))
      .resize(cell.w, cell.h, { fit: 'cover' })
      .composite([{ input: await sharp(ring).png().toBuffer(), blend: 'dest-in' }])
      .png()
      .toBuffer();
    tiles.push({ input: masked, left: cell.gap + (i * 2 + 1) * (cell.w + cell.gap), top: cell.gap + 2 * (cell.h + cell.gap) });
  }
  const qaDir = path.join(root, '.qa', 'visuals');
  await mkdir(qaDir, { recursive: true });
  const file = path.join(qaDir, 'contact-sheet.png');
  await sharp({ create: { width, height, channels: 3, background: '#FFFFFF' } }).composite(tiles).png().toFile(file);
  log(`  = ${path.relative(root, file)}`);
}

export async function buildAll({ root, argv }) {
  const only = argv.find((a) => a.startsWith('--only='))?.slice(7) ?? '';
  const outDir = path.join(root, 'public', 'images', 'generated');
  await mkdir(outDir, { recursive: true });
  const svgs = new Map();
  const ctx = {
    outDir,
    wants: (name) => !only || name.startsWith(only) || only.startsWith(name),
    keep: (name, svg) => svgs.set(name, svg),
    log: (line) => process.stdout.write(`${line}\n`),
  };
  await buildAgents(ctx);
  await buildJourney(ctx);
  await buildChart(ctx);
  await buildOg(ctx);
  if (argv.includes('--svg')) {
    const dir = path.join(root, '.qa', 'visuals', 'svg');
    await mkdir(dir, { recursive: true });
    for (const [name, svg] of svgs) await writeFile(path.join(dir, `${name}.svg`), svg);
  }
  if (argv.includes('--qa')) await contactSheet(root, outDir, ctx.log);
}
