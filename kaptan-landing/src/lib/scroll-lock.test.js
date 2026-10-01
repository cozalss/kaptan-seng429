import { describe, expect, it, vi } from 'vitest';
import { createScrollLock } from './scroll-lock.js';

function setup() {
  const onLock = vi.fn();
  const onUnlock = vi.fn();
  const lock = createScrollLock({ onLock, onUnlock });
  return { lock, onLock, onUnlock };
}

describe('createScrollLock', () => {
  it('starts unlocked', () => {
    const { lock } = setup();
    expect(lock.isLocked()).toBe(false);
    expect(lock.reasons()).toEqual([]);
  });

  it('locks on the first reason and unlocks when it is released', () => {
    const { lock, onLock, onUnlock } = setup();
    lock.lock('intro');
    expect(lock.isLocked()).toBe(true);
    expect(onLock).toHaveBeenCalledTimes(1);
    lock.unlock('intro');
    expect(lock.isLocked()).toBe(false);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('stays locked while any other reason remains (intro vs overlay race)', () => {
    const { lock, onLock, onUnlock } = setup();
    lock.lock('intro');
    lock.lock('overlay');
    lock.unlock('intro');
    expect(lock.isLocked()).toBe(true);
    expect(onUnlock).not.toHaveBeenCalled();
    lock.unlock('overlay');
    expect(lock.isLocked()).toBe(false);
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('counts repeated locks of the same reason (one overlay replacing another)', () => {
    const { lock, onUnlock } = setup();
    lock.lock('overlay');
    lock.lock('overlay');
    lock.unlock('overlay');
    expect(lock.isLocked()).toBe(true);
    lock.unlock('overlay');
    expect(lock.isLocked()).toBe(false);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('ignores unlocks for reasons that are not held', () => {
    const { lock, onUnlock } = setup();
    lock.unlock('overlay');
    expect(onUnlock).not.toHaveBeenCalled();
    lock.lock('intro');
    lock.unlock('overlay');
    expect(lock.isLocked()).toBe(true);
  });

  it('lists the active reasons', () => {
    const { lock } = setup();
    lock.lock('intro');
    lock.lock('overlay');
    expect(lock.reasons().sort()).toEqual(['intro', 'overlay']);
  });

  it('rejects empty or non-string reasons', () => {
    const { lock } = setup();
    expect(() => lock.lock('')).toThrow(TypeError);
    expect(() => lock.lock(undefined)).toThrow(TypeError);
    expect(() => lock.unlock(3)).toThrow(TypeError);
  });

  it('release() drops every reason at once', () => {
    const { lock, onUnlock } = setup();
    lock.lock('intro');
    lock.lock('overlay');
    lock.release();
    expect(lock.isLocked()).toBe(false);
    expect(onUnlock).toHaveBeenCalledTimes(1);
    lock.release();
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });
});
