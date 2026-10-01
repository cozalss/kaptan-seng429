import { describe, expect, test } from 'vitest';
import { KEY_STRIDE, createKeyBuffer, placeKey } from './keys.js';

describe('plate keys', () => {
  test('a fresh buffer holds three hidden letters', () => {
    const keys = createKeyBuffer();
    expect(keys).toHaveLength(9);
    expect([keys[2], keys[5], keys[8]]).toEqual([0, 0, 0]);
  });

  test('records a letter where the scene would have inked it', () => {
    const keys = createKeyBuffer();
    expect(placeKey(keys, 'b', 120.5, 40, 0.9)).toBe(true);
    expect(Array.from(keys.subarray(KEY_STRIDE, KEY_STRIDE * 2))).toEqual([120.5, 40, expect.closeTo(0.9, 5)]);
  });

  test('without a buffer, or for another letter, the scene inks the letter itself', () => {
    expect(placeKey(null, 'a', 0, 0, 1)).toBe(false);
    expect(placeKey(createKeyBuffer(), 'd', 0, 0, 1)).toBe(false);
  });
});
