import { afterEach, describe, expect, it, vi } from 'vitest';

describe('shared ticker', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('runs one loop while anyone listens and stops when the last one leaves', async () => {
    let queued = [];
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (cb) => queued.push(cb) && queued.length);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const { subscribe, awake } = await import('./ticker.js');
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribe(a);
    const offB = subscribe(b);
    expect(queued).toHaveLength(1);
    const tick = (t) => {
      const q = queued;
      queued = [];
      q.forEach((cb) => cb(t));
    };
    tick(1000);
    tick(1016);
    expect(a).toHaveBeenCalledTimes(2);
    expect(a.mock.calls[1][0]).toBeCloseTo(0.016, 3);
    offA();
    tick(1032);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(3);
    offB();
    expect(awake()).toBe(0);
    expect(cancel).toHaveBeenCalled();
  });
});
