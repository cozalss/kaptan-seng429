import { describe, expect, test, vi } from 'vitest';
import { initGrain } from './grain.js';

describe('initGrain', () => {
  test('leaves layers untouched when no canvas context is available (jsdom)', () => {
    const layer = document.createElement('div');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    initGrain([layer]);

    expect(layer.classList.contains('has-grain')).toBe(false);
    warn.mockRestore();
  });

  test('ignores an empty list', () => {
    expect(() => initGrain([null])).not.toThrow();
  });
});
