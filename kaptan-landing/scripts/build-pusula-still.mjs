// Renders the ink scene's final frame (the still for reduced motion / no script) and encodes it
// into public/images/generated/pusula-01-{900,1400}.{avif,webp}.
//
// The frame is drawn by the real renderer: a headless Microsoft Edge opens the running dev server,
// imports src/components/compass/scene.js + timeline.js, renders poseAt(1) into a transparent
// 2800 × 2000 canvas (a 1400 × 1000 box at 2×), and hands the PNG back. The empty paper around the
// slip and compass is trimmed and a margin added; the image keeps its alpha, so it prints on the
// section's own paper with no box around it.
//
// Usage: node scripts/build-pusula-still.mjs [dev-server-url]   (default http://localhost:5173/)

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const URL = process.argv[2] ?? 'http://localhost:5173/';
const OUT = path.join(ROOT, 'public/images/generated');
const BOX = { width: 1400, height: 1000, dpr: 2 };
const WIDTHS = [900, 1400];
const MARGIN = 0.06; // of the trimmed width, on every side

async function renderFinalFrame() {
  const browser = await chromium.launch({ channel: process.env.QA_CHANNEL ?? 'msedge' });
  try {
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    const dataUrl = await page.evaluate(async (box) => {
      const [{ createInkScene }, { poseAt }, { fontsReady }] = await Promise.all([
        import('/src/components/compass/scene.js'),
        import('/src/components/compass/timeline.js'),
        import('/src/components/compass/sprites.js'),
      ]);
      await fontsReady(document, 4000);
      const canvas = document.createElement('canvas');
      const scene = createInkScene({ canvas, dpr: box.dpr, cards: 2 });
      scene.setSize(box.width, box.height, box.dpr);
      scene.render(poseAt(1));
      await new Promise((resolve) => setTimeout(resolve, 300)); // sprite bitmaps settle
      scene.render(poseAt(1));
      return canvas.toDataURL('image/png');
    }, BOX);
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  } finally {
    await browser.close();
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const png = await renderFinalFrame();
  const trimmed = await sharp(png).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
  const pad = Math.round(trimmed.info.width * MARGIN);
  const base = sharp(trimmed.data)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const framed = await base.png().toBuffer({ resolveWithObject: true });
  for (const width of WIDTHS) {
    const resized = sharp(framed.data).resize({ width, kernel: 'lanczos3' });
    await resized.clone().avif({ quality: 60, effort: 6 }).toFile(path.join(OUT, `pusula-01-${width}.avif`));
    await resized.clone().webp({ quality: 84, effort: 6 }).toFile(path.join(OUT, `pusula-01-${width}.webp`));
  }
  console.info(`pusula still: ${framed.info.width} × ${framed.info.height} → ${WIDTHS.join(', ')} px`);
}

main().catch((error) => {
  console.error('[build-pusula-still] failed:', error);
  process.exitCode = 1;
});
