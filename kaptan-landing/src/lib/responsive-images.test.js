import { describe, expect, it } from 'vitest';
import {
  IMAGE_SETS,
  buildSrcset,
  imageNameFromPath,
  pictureSet,
  variantPath,
} from './responsive-images.js';

describe('imageNameFromPath', () => {
  it('maps a public image path to its set name', () => {
    expect(imageNameFromPath('/images/ajan-1.jpg')).toBe('ajan-1');
    expect(imageNameFromPath('/images/harita.jpg')).toBe('harita');
  });

  it('returns null for unknown or malformed paths', () => {
    expect(imageNameFromPath('/images/unknown.jpg')).toBeNull();
    expect(imageNameFromPath('/images/ajan-1.gif')).toBeNull();
    expect(imageNameFromPath(undefined)).toBeNull();
    expect(imageNameFromPath('/images/constructor.jpg')).toBeNull();
  });
});

describe('variantPath', () => {
  it('builds the generated file URL', () => {
    expect(variantPath('harita', 1920, 'avif')).toBe('/images/generated/harita-1920.avif');
  });

  it('rejects unsafe names and bad widths', () => {
    expect(() => variantPath('../x', 100, 'jpg')).toThrow(TypeError);
    expect(() => variantPath('harita', 0, 'jpg')).toThrow(TypeError);
    expect(() => variantPath('harita', 12.5, 'jpg')).toThrow(TypeError);
  });
});

describe('buildSrcset', () => {
  it('lists every width of the set with a w descriptor', () => {
    expect(buildSrcset('harita', 'webp')).toBe(
      '/images/generated/harita-1280.webp 1280w, /images/generated/harita-1920.webp 1920w',
    );
  });

  it('throws for an unknown set', () => {
    expect(() => buildSrcset('nope', 'jpg')).toThrow(RangeError);
  });
});

describe('pictureSet', () => {
  it('returns AVIF then WebP sources and a JPEG fallback', () => {
    const set = pictureSet('ajan-2');
    expect(set.sources.map((source) => source.type)).toEqual(['image/avif', 'image/webp']);
    expect(set.sources[0].srcset).toContain('/images/generated/ajan-2-800.avif 800w');
    expect(set.img.src).toBe('/images/generated/ajan-2-600.jpg');
    expect(set.img.srcset).toContain('ajan-2-400.jpg 400w');
  });

  it('never asks for a variant wider than the configured widths', () => {
    const widths = pictureSet('harita').img.srcset.match(/(\d+)w/g).map((w) => Number.parseInt(w, 10));
    expect(widths).toEqual([...IMAGE_SETS.harita]);
  });
});

describe('IMAGE_SETS', () => {
  it('holds the KAPtan sets: 8 agent cards, 4 journey steps and the chart film', () => {
    const names = Object.keys(IMAGE_SETS);
    expect(names.filter((name) => name.startsWith('ajan-'))).toHaveLength(8);
    expect(names.filter((name) => name.startsWith('yolculuk-'))).toHaveLength(4);
    expect(IMAGE_SETS.harita).toEqual([1280, 1920]);
    expect(IMAGE_SETS['ajan-8']).toEqual([400, 600, 800]);
    expect(IMAGE_SETS['yolculuk-4']).toEqual([600, 900, 1200, 1600, 2000]);
  });
});
