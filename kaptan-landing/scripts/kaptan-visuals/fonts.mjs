// Makes the site's own fonts available to librsvg (via fontconfig) for the procedural visuals.
// Must run BEFORE sharp is first imported: fontconfig reads FONTCONFIG_FILE once, at init.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { woff2ToSfnt } from './woff2.mjs';

const toFcPath = (p) => p.replaceAll('\\', '/');

/**
 * Decodes every public/fonts/*.woff2 into a private font dir and makes fontconfig see ONLY those
 * fonts (no system fonts: the output is identical on every machine).
 * @returns {string[]} the decoded .ttf paths
 */
export function installSiteFonts(fontsDir) {
  const dir = path.join(tmpdir(), 'kaptan-visuals-fonts');
  const cache = path.join(dir, 'cache');
  mkdirSync(cache, { recursive: true });
  const written = readdirSync(fontsDir)
    .filter((file) => file.endsWith('.woff2'))
    .sort()
    .map((file) => {
      const out = path.join(dir, file.replace(/\.woff2$/, '.ttf'));
      writeFileSync(out, woff2ToSfnt(readFileSync(path.join(fontsDir, file))));
      return out;
    });
  const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${toFcPath(dir)}</dir>
  <cachedir>${toFcPath(cache)}</cachedir>
  <match target="font"><edit name="hinting" mode="assign"><bool>false</bool></edit><edit name="hintstyle" mode="assign"><const>hintnone</const></edit><edit name="antialias" mode="assign"><bool>true</bool></edit></match>
</fontconfig>
`;
  const confPath = path.join(dir, 'fonts.conf');
  writeFileSync(confPath, conf);
  process.env.FONTCONFIG_FILE = confPath;
  return written;
}
