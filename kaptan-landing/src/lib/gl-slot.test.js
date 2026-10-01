import { afterEach, describe, expect, test, vi } from 'vitest';
import { claimGLSlot, isGLSlotTaken } from './gl-slot.js';

describe('claimGLSlot', () => {
  let giveBack = () => {};
  afterEach(() => giveBack());

  test('a new claim releases the previous holder', () => {
    const first = vi.fn();
    const second = vi.fn();
    claimGLSlot(first);
    giveBack = claimGLSlot(second);
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    expect(isGLSlotTaken()).toBe(true);
  });

  test('giving the slot back frees it, and a stale give-back is a no-op', () => {
    const first = vi.fn();
    const staleGiveBack = claimGLSlot(first);
    giveBack = claimGLSlot(vi.fn());
    staleGiveBack();
    expect(isGLSlotTaken()).toBe(true);
    giveBack();
    expect(isGLSlotTaken()).toBe(false);
  });

  test('re-claiming with the same release does not release itself', () => {
    const release = vi.fn();
    claimGLSlot(release);
    giveBack = claimGLSlot(release);
    expect(release).not.toHaveBeenCalled();
  });
});
