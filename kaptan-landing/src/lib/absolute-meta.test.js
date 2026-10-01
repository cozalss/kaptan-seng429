import { describe, expect, it } from 'vitest';
import { absolutizeMetaImages, toAbsoluteUrl } from './absolute-meta.js';

const BASE = 'https://www.example.com/';

describe('toAbsoluteUrl', () => {
  it('resolves site-relative paths and keeps absolute URLs', () => {
    expect(toAbsoluteUrl('/images/a.jpg', BASE)).toBe('https://www.example.com/images/a.jpg');
    expect(toAbsoluteUrl('https://cdn.example.org/a.jpg', BASE)).toBe('https://cdn.example.org/a.jpg');
  });
});

describe('absolutizeMetaImages', () => {
  it('rewrites og:image and twitter:image only', () => {
    const html = [
      '<meta property="og:image" content="/images/generated/hero-1280.jpg" />',
      '<meta property="twitter:image" content="/images/x.jpg" />',
      '<meta property="og:image:width" content="1280" />',
      '<link rel="icon" href="/favicon.svg" />',
    ].join('\n');
    const out = absolutizeMetaImages(html, BASE);
    expect(out).toContain('content="https://www.example.com/images/generated/hero-1280.jpg"');
    expect(out).toContain('content="https://www.example.com/images/x.jpg"');
    expect(out).toContain('<meta property="og:image:width" content="1280" />');
    expect(out).toContain('href="/favicon.svg"');
  });

  it('also rewrites the name="twitter:image" form', () => {
    const out = absolutizeMetaImages('<meta name="twitter:image" content="/images/generated/og-1280.jpg" />', BASE);
    expect(out).toBe('<meta name="twitter:image" content="https://www.example.com/images/generated/og-1280.jpg" />');
  });

  it('rejects a missing or relative base', () => {
    expect(() => absolutizeMetaImages('', undefined)).toThrow(TypeError);
    expect(() => absolutizeMetaImages('', '/relative/')).toThrow(TypeError);
  });
});
