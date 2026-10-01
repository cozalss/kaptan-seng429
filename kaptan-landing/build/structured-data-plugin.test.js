// Runs in node. Note: vite.config.js `test.include` must list 'build/**/*.test.js'.
import { describe, expect, it } from 'vitest';
import { SITE } from '../src/config/site.js';
import { AGENTS } from '../src/data/agents.js';
import { buildStructuredData, serializeJsonLd, structuredData } from './structured-data-plugin.js';

describe('buildStructuredData', () => {
  const data = buildStructuredData(SITE, AGENTS);

  it('describes the project as a CreativeWork, part of the SENG 429 course', () => {
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('CreativeWork');
    expect(data.name).toBe('KAPtan');
    expect(data.inLanguage).toBe('tr-TR');
    expect(data.description).toMatch(/Yatırım tavsiyesi değildir/);
    expect(data.isPartOf).toMatchObject({
      '@type': 'Course',
      courseCode: 'SENG 429',
      provider: { '@type': 'CollegeOrUniversity', name: 'Çankaya Üniversitesi' },
    });
  });

  it('uses the 1280×853 og image under the site url', () => {
    expect(data.url).toMatch(/^https:\/\//);
    expect(data.image).toBe(new URL('/images/generated/og-1280.jpg', data.url).href);
  });

  it('prefers an explicit site url', () => {
    expect(buildStructuredData({ ...SITE, url: 'https://kaptan.example.org/' }).url).toBe('https://kaptan.example.org/');
  });

  it('names every agent in the keywords', () => {
    AGENTS.forEach((agent) => expect(data.keywords).toContain(agent.name));
  });

  it('adds sameAs only once a repository link exists', () => {
    const noRepo = buildStructuredData({ ...SITE, links: { ...SITE.links, githubUrl: null } });
    expect('sameAs' in noRepo).toBe(false);
    const withRepo = buildStructuredData({ ...SITE, links: { ...SITE.links, githubUrl: 'https://github.com/x/y' } });
    expect(withRepo.sameAs).toEqual(['https://github.com/x/y']);
  });

  it('never contains product, offer, price, review or rating markup', () => {
    const json = JSON.stringify(data);
    expect(json).not.toMatch(/aggregateRating|"review"|Review"|Offer|price|BeautySalon/);
  });
});

describe('serializeJsonLd / plugin', () => {
  it('escapes characters that could close the script tag', () => {
    const out = serializeJsonLd({ name: '</script><!-- & -->' });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<!--');
    expect(JSON.parse(out)).toEqual({ name: '</script><!-- & -->' });
  });

  it('injects one ld+json script into the head', () => {
    const plugin = structuredData();
    expect(plugin.name).toBe('kaptan:structured-data');
    const [tag] = plugin.transformIndexHtml('<html></html>');
    expect(tag).toMatchObject({ tag: 'script', attrs: { type: 'application/ld+json' }, injectTo: 'head' });
    expect(JSON.parse(tag.children)['@type']).toBe('CreativeWork');
  });
});
