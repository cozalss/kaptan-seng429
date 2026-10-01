import { defineConfig } from 'vite';
import { structuredData } from './build/structured-data-plugin.js';
import { SITE } from './src/config/site.js';
import { absolutizeMetaImages } from './src/lib/absolute-meta.js';

/** Build only: og:image must be absolute for link previews (dev keeps relative paths). */
function absoluteSocialImages(siteUrl) {
  return {
    name: 'kaptan:absolute-social-images',
    apply: 'build',
    transformIndexHtml: (html) => absolutizeMetaImages(html, siteUrl),
  };
}

export default defineConfig({
  plugins: [structuredData(), absoluteSocialImages(SITE.url)],
  // coverage/ is rewritten by `vitest --coverage`; watching it reloads every open dev tab.
  server: { port: 5173, open: false, watch: { ignored: ['**/coverage/**'] } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js', 'build/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/ui/**', 'src/utils/**', 'src/lib/**', 'src/data/**', 'src/components/hero/sea/{sea-swell,sea-spring}.js', 'src/components/compass/{config,funnel,geometry,parts,print,timeline,view}.js', 'build/**'],
      // Browser-only animation glue (GSAP/Lenis/WebGL wiring) is verified in real Chromium via
      // Playwright, not jsdom, so it is excluded from the unit-coverage gate.
      exclude: [
        'src/**/*.test.js',
        'src/lib/motion-guard.js',
        'src/lib/motion-setup.js',
        'src/lib/smooth-scroll.js',
        'src/lib/webgl/**',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
