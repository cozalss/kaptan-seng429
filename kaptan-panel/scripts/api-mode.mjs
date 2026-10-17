// Runs a command with the panel in http mode against the local FastAPI backend, the same way
// in PowerShell, cmd and Git Bash (no cross-env dependency):
//   node scripts/api-mode.mjs next dev -p 3100
//   node scripts/api-mode.mjs playwright test
// Values already set in the environment win, so another backend is one variable away:
//   KAPTAN_API_ORIGIN=http://127.0.0.1:9000 npm run dev:api

import { spawn } from 'node:child_process';

const DEFAULTS = {
  NEXT_PUBLIC_API_MODE: 'http',
  KAPTAN_API_ORIGIN: 'http://127.0.0.1:8000',
  NEXT_PUBLIC_DEMO_MODE: 'true',
  // Read by playwright.config.ts: the http-mode project (backend reset, http-only expectations).
  E2E_API: '1',
};

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: node scripts/api-mode.mjs <command> [...args]');
  process.exit(2);
}

const env = { ...DEFAULTS, ...process.env };
// The mode itself is not overridable: this wrapper exists to run http mode.
env.NEXT_PUBLIC_API_MODE = 'http';
env.E2E_API = '1';

// One command line through the shell, so npm's .cmd shims resolve on Windows too. The words
// come from package.json scripts (not user input); quote any that carry spaces.
const line = [cmd, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
const child = spawn(line, { stdio: 'inherit', env, shell: true });
const forward = (signal) => () => child.kill(signal);
process.on('SIGINT', forward('SIGINT'));
process.on('SIGTERM', forward('SIGTERM'));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
