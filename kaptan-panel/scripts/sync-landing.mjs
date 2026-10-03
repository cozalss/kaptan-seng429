// Builds the public landing page (../kaptan-landing, Vite) and copies its output into public/,
// so one Next.js deployment serves both: "/" is the landing (rewritten to /index.html in
// next.config.ts) and every panel route lives beside it. The copied files are git-ignored.
//
// Skip with SKIP_LANDING=1 (e.g. panel-only unit work).

import { execSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PANEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LANDING = resolve(PANEL, '..', 'kaptan-landing');
const PUBLIC = join(PANEL, 'public');
// Everything the landing build emits; nothing else in public/ is touched.
const SYNCED = ['index.html', 'assets', 'images', 'fonts', 'favicon.svg'];

if (process.env.SKIP_LANDING === '1') {
  console.log('[landing] SKIP_LANDING=1, skipped');
  process.exit(0);
}

if (!existsSync(join(LANDING, 'package.json'))) {
  console.error(`[landing] not found at ${LANDING}`);
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { cwd: LANDING, stdio: 'inherit' });

// Vercel builds with NODE_ENV=production, which makes npm skip devDependencies (Vite included),
// and a restored build cache can hold a partial node_modules: install unless Vite is really there.
if (!existsSync(join(LANDING, 'node_modules', 'vite', 'package.json'))) run('npm ci --include=dev --no-audit --no-fund');
run('npm run build');

const dist = join(LANDING, 'dist');
const emitted = readdirSync(dist);
const unexpected = emitted.filter((name) => !SYNCED.includes(name));
if (unexpected.length > 0) {
  console.error(`[landing] unexpected build output, add it to SYNCED and .gitignore: ${unexpected.join(', ')}`);
  process.exit(1);
}

for (const name of SYNCED) rmSync(join(PUBLIC, name), { recursive: true, force: true });
for (const name of emitted) cpSync(join(dist, name), join(PUBLIC, name), { recursive: true });
console.log(`[landing] copied ${emitted.join(', ')} into public/`);
