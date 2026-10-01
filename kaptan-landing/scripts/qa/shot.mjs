// Headless screenshots of the running dev server, for visual QA without a shared browser.
//   node scripts/qa/shot.mjs --out=DIR/name.png [--url=http://localhost:5173/] [--w=1440] [--h=900]
//     [--at=#olaylar | --at=1200] [--offset=0] [--wait=1800] [--reduced] [--full]
// --at scrolls to a selector's top (plus --offset px) or to an absolute y before the shot.
// Prints console errors of the page, so a broken script shows up next to the picture.

import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  }),
);

const url = args.url ?? 'http://localhost:5173/';
const width = Number(args.w ?? 1440);
const height = Number(args.h ?? 900);
const wait = Number(args.wait ?? 1800);
if (!args.out) {
  process.stderr.write('usage: node scripts/qa/shot.mjs --out=path.png [--at=#id|y] [--w] [--h] [--reduced] [--full]\n');
  process.exit(2);
}

// Uses the installed Microsoft Edge (Chromium) unless QA_CHANNEL says otherwise: no browser download needed.
const browser = await chromium.launch({ channel: process.env.QA_CHANNEL ?? 'msedge' });
try {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: args.reduced ? 'reduce' : 'no-preference',
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(3500); // loader + intro
  if (args.at !== undefined) {
    const offset = Number(args.offset ?? 0);
    await page.evaluate(
      ({ at, offset }) => {
        // a selector lands where an anchor jump would: below the fixed header (scroll-padding/-margin)
        const el = /^\d+$/.test(at) ? null : document.querySelector(at);
        const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        const margin = el ? parseFloat(getComputedStyle(el).scrollMarginTop) || 0 : 0;
        const y = el ? el.getBoundingClientRect().top + window.scrollY - pad - margin : Number(at);
        window.scrollTo(0, y + offset);
      },
      { at: String(args.at), offset },
    );
    // a second nudge lets pinned sections and smooth scroll settle on the target
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, 1);
  }
  await page.waitForTimeout(wait);
  // JPEG keeps proofs small enough to open in an image viewer or an agent's Read tool.
  const type = /.png$/i.test(args.out) ? 'png' : 'jpeg';
  await page.screenshot({ path: args.out, fullPage: Boolean(args.full), type, ...(type === 'jpeg' ? { quality: 82 } : {}) });
  process.stdout.write(`saved ${args.out}\n`);
  if (errors.length) process.stdout.write(`console errors:\n  ${errors.join('\n  ')}\n`);
} finally {
  await browser.close();
}
