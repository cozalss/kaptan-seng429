// Procedural KAPtan visuals: agent cards, journey windows, the nautical chart and the OG image.
// Everything is drawn as SVG (scripts/kaptan-visuals/*), rasterised by sharp/librsvg with the
// site's own fonts, given a fine paper grain and encoded like scripts/build-images.mjs.
//   npm run visuals                  → (re)build every file (deterministic: same bytes every run)
//   npm run visuals -- --only=ajan-3 → only sets whose name starts with "ajan-3"
//   npm run visuals -- --qa          → also write .qa/visuals/contact-sheet.png
// Output names follow src/lib/responsive-images.js (KAPTAN-BRIEF.md §4).

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSiteFonts } from './kaptan-visuals/fonts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// fontconfig reads FONTCONFIG_FILE from the C runtime environment at start-up, which a running
// Node process cannot change on Windows: decode the fonts, then re-run this script in a child
// process that starts with the variable already set.
if (!process.env.KAPTAN_VISUALS_CHILD) {
  installSiteFonts(path.join(ROOT, 'public', 'fonts'));
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, KAPTAN_VISUALS_CHILD: '1' },
  });
  process.exit(child.status ?? 1);
}

const { buildAll } = await import('./kaptan-visuals/pipeline.mjs');

buildAll({ root: ROOT, argv: process.argv.slice(2) }).catch((error) => {
  process.stderr.write(`build-kaptan-visuals failed: ${error.stack ?? error}\n`);
  process.exitCode = 1;
});
