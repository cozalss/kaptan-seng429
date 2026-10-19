// Vite plugin: injects schema.org JSON-LD for the project page into index.html at dev and build
// time. KAPtan is published as a CreativeWork: no ratings, offers or prices.

import { SITE } from '../src/config/site.js';
import { AGENTS } from '../src/data/agents.js';

const PLACEHOLDER_URL = 'https://www.example.com/'; // PLACEHOLDER: set SITE.url before publishing
const OG_IMAGE = '/images/generated/og-1280.jpg';

/**
 * Pure: builds the CreativeWork JSON-LD object.
 * @param {typeof SITE} site
 * @param {ReadonlyArray<{name: string}>} agents
 */
export function buildStructuredData(site, agents = AGENTS) {
  const url = site.url ?? PLACEHOLDER_URL;
  const sameAs = [site.links?.githubUrl].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: site.name,
    alternateName: `${site.name} — ${site.descriptor}`,
    description: site.description,
    url,
    inLanguage: 'tr-TR',
    image: new URL(OG_IMAGE, url).href,
    isAccessibleForFree: true,
    keywords: ['KAP', 'BIST', 'çok ajanlı yapay zekâ', 'RAG', ...agents.map((agent) => agent.name)].join(', '),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/** JSON safe to place inside <script>: no "</script>" or HTML comment openers can survive. */
export function serializeJsonLd(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * @param {{site?: object, agents?: ReadonlyArray<object>}} [options]
 * @returns {import('vite').Plugin}
 */
export function structuredData({ site = SITE, agents = AGENTS } = {}) {
  return {
    name: 'kaptan:structured-data',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          children: serializeJsonLd(buildStructuredData(site, agents)),
          injectTo: 'head',
        },
      ];
    },
  };
}
