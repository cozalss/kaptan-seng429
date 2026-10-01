import { describe, expect, test, vi } from 'vitest';
import { lazyEffect } from './lazy-effect.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('lazyEffect', () => {
  test('starts the effect once the module arrives and destroys it later', async () => {
    const destroy = vi.fn();
    const start = vi.fn(() => destroy);
    const stop = lazyEffect(() => Promise.resolve({ ok: true }), start, 'test');
    await flush();
    expect(start).toHaveBeenCalledWith({ ok: true });
    stop();
    stop();
    expect(destroy).toHaveBeenCalledOnce();
  });

  test('never starts when destroyed before the chunk has loaded', async () => {
    const start = vi.fn();
    const stop = lazyEffect(() => Promise.resolve({}), start, 'test');
    stop();
    await flush();
    expect(start).not.toHaveBeenCalled();
  });

  test('accepts { destroy } handles', async () => {
    const handle = { destroy: vi.fn() };
    const stop = lazyEffect(() => Promise.resolve({}), () => handle, 'test');
    await flush();
    stop();
    expect(handle.destroy).toHaveBeenCalledOnce();
  });

  test('warns instead of throwing when loading or starting fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    lazyEffect(() => Promise.reject(new Error('offline')), vi.fn(), 'load');
    lazyEffect(() => Promise.resolve({}), () => { throw new Error('boom'); }, 'start');
    await flush();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
