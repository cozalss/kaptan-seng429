// Guards the hand-written markup in index.html: <picture> sets must not drift from the generated
// image sets, and the page must stay on-message (KAPtan copy, no salon leftovers, no dead links).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { IMAGE_FORMATS, IMAGE_SETS, buildSrcset, variantPath } from './responsive-images.js';

// Vitest runs from the project root (import.meta.url is not a file: URL under jsdom).
const ROOT = `${path.resolve(process.cwd())}/`;
const html = readFileSync(`${ROOT}index.html`, 'utf8');
// The hero is drawn on a canvas (hero-stream.js); only the chart film is a <picture> set in the markup.
const PAGE_SETS = ['harita'];

/** The page without the HERO / PUSULA blocks other agents own (their copy is checked by them). */
function contentOutsideOwnedBlocks(source) {
  return source
    .replace(/<!-- HERO-HEAD:START -->[\s\S]*?<!-- HERO-HEAD:END -->/, '')
    .replace(/<!-- HERO:START -->[\s\S]*?<!-- HERO:END -->/, '')
    .replace(/<!-- PUSULA:START -->[\s\S]*?<!-- PUSULA:END -->/, '');
}

describe('index.html responsive images', () => {
  it.each(PAGE_SETS)('lists every generated %s variant', (name) => {
    IMAGE_FORMATS.forEach(({ ext }) => expect(html).toContain(buildSrcset(name, ext)));
  });

  it('blocks the loader on no image (the hero sea is drawn; the loader waits for the headline font)', () => {
    expect(html).not.toContain('data-loader-critical');
    expect(html).toContain('data-sea');
  });

  it('references only images that exist in public/', () => {
    const paths = new Set(html.match(/\/images\/[\w./-]+\.(?:avif|webp|jpg)/g));
    expect(paths.size).toBeGreaterThan(0);
    paths.forEach((path) => expect(existsSync(`${ROOT}public${path}`), path).toBe(true));
  });
});

describe('index.html content', () => {
  const page = contentOutsideOwnedBlocks(html);

  it('is titled and shared as KAPtan with the 1280×853 og image', () => {
    expect(html).toMatch(/<title>KAPtan[^<]*<\/title>/);
    expect(html).toContain('<meta property="og:image" content="/images/generated/og-1280.jpg" />');
    expect(html).toContain('<meta property="og:image:width" content="1280" />');
    expect(html).toContain('<meta property="og:image:height" content="853" />');
  });

  it('draws the KAPtan compass mark and uses it everywhere', () => {
    expect(html).toContain('<symbol id="kaptan-logo" viewBox="0 0 212 64">');
    expect(html).not.toContain('#oyla-logo');
    expect(html.match(/<use href="#kaptan-logo" \/>/g).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('data-loader-needle');
    expect(html).toContain('Bildirimler taranıyor');
  });

  it('has the KAPtan sections in order', () => {
    const ids = [...page.matchAll(/<section[^>]*\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(['ajanlar', 'olaylar', 'yolculuk']);
  });

  it('opens every chapter of the book with its running head, in reading order', () => {
    const heads = [...html.matchAll(/class="running-head[^"]*">[\s\S]*?<\/div>/g)].map((match) =>
      match[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    );
    const chapters = ['Bölüm 2 · Tayfa', 'Bölüm 3 · Seyir Kuralları', 'Ara · 350’den 1’e', 'Bölüm 4 · Rota', 'Kolofon'];
    expect(heads.map((head) => chapters.find((chapter) => head.endsWith(chapter)))).toEqual(chapters);
    expect(html).toContain('Bölüm 1 · <span class="hero__masthead-title">Fırtına</span>');
  });

  it('carries no salon copy, booking, messaging or form outside the hero/pusula blocks', () => {
    expect(page).not.toMatch(/ÖYKÜ|oyla|oyku|Güzellik|salon|randevu|WhatsApp|wa\.me|KVKK|newsletter|<form|<input/i);
  });

  it('never renders a dead "#" link and states the disclaimer', () => {
    expect(page).not.toMatch(/href="#"/);
    expect(page).toContain('Yatırım tavsiyesi değildir.');
    expect(page).toContain('data-action="open-legal"');
  });

  it('never keeps a script-less visitor behind the loader (the CSS failsafe alone waits 10 s)', () => {
    const noscript = html.match(/<head>[\s\S]*?<noscript>([\s\S]*?)<\/noscript>[\s\S]*?<\/head>/)?.[1] ?? '';
    // :root: the built stylesheet link lands after this block, so a bare `.loader` would lose.
    expect(noscript).toMatch(/:root \.loader\s*\{\s*display:\s*none;?\s*\}/);
  });
});

describe('generated image files', () => {
  it('exist for every configured set, width and format (VISUALS / HERO image scripts)', () => {
    const missing = Object.entries(IMAGE_SETS).flatMap(([name, widths]) =>
      widths.flatMap((width) =>
        IMAGE_FORMATS.map(({ ext }) => variantPath(name, width, ext)).filter((path) => !existsSync(`${ROOT}public${path}`)),
      ),
    );
    expect(missing).toEqual([]);
  });

  it('include the og image', () => {
    expect(existsSync(`${ROOT}public/images/generated/og-1280.jpg`)).toBe(true);
  });
});
