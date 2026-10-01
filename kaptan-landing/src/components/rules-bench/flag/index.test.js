import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMast, createPennant } from './index.js';
import { pennantSvg } from './svg.js';
import { liveStaffs } from './staff.js';
import { awake } from './ticker.js';

// A 2D context that accepts every call (jsdom has no canvas) and counts strokes.
function fakeContext() {
  const calls = { stroke: 0, fill: 0, drawImage: 0 };
  const ctx = new Proxy(
    { calls },
    {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
          if (key in calls) calls[key] += 1;
          return args.length ? undefined : undefined;
        };
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    },
  );
  return ctx;
}

let frames = [];
let observers = [];
let contexts = [];

function installBrowser() {
  frames = [];
  observers = [];
  contexts = [];
  vi.stubGlobal('requestAnimationFrame', (cb) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  class IO {
    constructor(cb) {
      this.cb = cb;
      observers.push(this);
    }
    observe(el) {
      this.els = [...(this.els || []), el];
    }
    unobserve(el) {
      this.els = (this.els || []).filter((e) => e !== el);
    }
    disconnect() {
      this.els = [];
    }
  }
  class RO {
    observe() {}
    disconnect() {}
  }
  window.IntersectionObserver = IO;
  window.ResizeObserver = RO;
  window.requestAnimationFrame = globalThis.requestAnimationFrame;
  window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    const ctx = fakeContext();
    contexts.push(ctx);
    return ctx;
  });
}

function sized(el, w, h) {
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: h, configurable: true });
  document.body.appendChild(el);
  return el;
}

// Runs queued animation frames (1/60 s apart) until none are queued or the cap is hit.
// The cloth renderer is a lazy chunk (live.js): wait until a created mast/pennant has it.
async function loaded() {
  await import('./live.js');
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function flush(max = 2000) {
  let now = 0;
  let n = 0;
  while (frames.length && n < max) {
    const batch = frames;
    frames = [];
    now += 1000 / 60;
    batch.forEach((cb) => cb(now));
    n += 1;
  }
  return n;
}

const show = (visible = true, only = null) =>
  observers.forEach((o) => {
    const entries = (o.els || []).filter((el) => !only || only.includes(el)).map((target) => ({ target, isIntersecting: visible }));
    if (entries.length) o.cb(entries);
  });

describe('createMast (canvas)', () => {
  beforeEach(installBrowser);
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('inks the mast, hoists a pennant, then sleeps (zero frames when idle)', async () => {
    const host = sized(document.createElement('div'), 150, 620);
    const mast = createMast({ host });
    await loaded();
    const canvas = host.querySelector('canvas.flag-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(canvas.width).toBe(150); // DPR 1 in jsdom
    show();
    flush();
    expect(awake()).toBe(0);
    mast.setState('E1', 'hoisted');
    expect(awake()).toBe(1);
    const ran = flush();
    expect(ran).toBeGreaterThan(60);
    expect(ran).toBeLessThan(2000);
    expect(awake()).toBe(0);
    expect(Math.max(...contexts.map((c) => c.calls.stroke))).toBeGreaterThan(100);
    mast.destroy();
    expect(host.querySelector('canvas')).toBeNull();
  });

  it('jumps to a state set while off screen and validates its input', () => {
    const host = sized(document.createElement('div'), 150, 620);
    const mast = createMast({ host });
    mast.setState('E2', 'half');
    expect(awake()).toBe(0);
    expect(() => mast.setState('E7', 'hoisted')).toThrow(TypeError);
    expect(() => mast.setState('E1', 'up')).toThrow(TypeError);
    mast.destroy();
  });

  it('makes a small staff pennant beside a title', async () => {
    const host = sized(document.createElement('span'), 52, 36);
    const pennant = createPennant({ host, id: 'E3' });
    await loaded();
    show(); // the shared watcher hands it a live slot…
    show(); // …and its canvas comes on screen
    pennant.setState('hoisted');
    expect(awake()).toBe(1);
    flush();
    expect(awake()).toBe(0);
    pennant.destroy();
    expect(host.classList.contains('flag-host')).toBe(false);
  });

  it('keeps at most two live cloth canvases on a phone; the rest are printed', async () => {
    const hosts = ['E1', 'E2', 'E3', 'E4', 'E1', 'E2'].map(() => sized(document.createElement('span'), 52, 36));
    const pennants = hosts.map((host, k) => createPennant({ host, id: `E${(k % 4) + 1}` }));
    await loaded();
    pennants.forEach((p) => p.setState('hoisted'));
    show();
    flush();
    expect(liveStaffs()).toBe(2);
    expect(document.querySelectorAll('canvas.flag-canvas')).toHaveLength(2);
    await vi.waitFor(() => expect(document.querySelectorAll('.flag-still--staff')).toHaveLength(4));
    expect(hosts[0].querySelector('canvas')).not.toBeNull();
    // the first two scroll away: their slots pass to waiting pennants, and they become prints
    show(false, hosts.slice(0, 2));
    expect(liveStaffs()).toBe(2);
    expect(hosts[0].querySelector('canvas')).toBeNull();
    expect(hosts[2].querySelector('canvas')).not.toBeNull();
    pennants.forEach((p) => p.destroy());
    expect(liveStaffs()).toBe(0);
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('needs a host and a known id', () => {
    expect(() => createMast({})).toThrow(TypeError);
    expect(() => createPennant({ host: document.createElement('span'), id: 'E0' })).toThrow(TypeError);
  });
});

describe('reduced motion: static SVG', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('prints the mast with four pennants and reprints on a state change', async () => {
    const host = sized(document.createElement('div'), 150, 620);
    const mast = createMast({ host, reduced: true });
    mast.setState('E4', 'folded'); // queued until the print has loaded
    await vi.waitFor(() => expect(host.querySelector('.flag-still')).not.toBeNull());
    expect(host.querySelectorAll('.flag-still__pennant')[3].dataset.state).toBe('folded');
    expect(host.querySelector('canvas')).toBeNull();
    const items = host.querySelectorAll('.flag-still__pennant');
    expect(items).toHaveLength(4);
    expect(items[0].innerHTML.slice(0, 60)).toBe(pennantSvg('E1').slice(0, 60));
    expect(items[0].dataset.state).toBe('down');
    const downTop = parseFloat(items[0].style.top);
    mast.setState('E1', 'hoisted');
    expect(items[0].dataset.state).toBe('hoisted');
    expect(parseFloat(items[0].style.top)).toBeLessThan(downTop);
    mast.setState('E1', 'half');
    expect(items[0].dataset.state).toBe('half');
    expect(() => mast.setState('E5', 'half')).toThrow(TypeError);
    mast.destroy();
    expect(host.querySelector('.flag-still')).toBeNull();
  });

  it('falls back to the print when there is no 2D canvas', async () => {
    const host = sized(document.createElement('span'), 52, 36);
    const pennant = createPennant({ host, id: 'E4' });
    await vi.waitFor(() => expect(host.querySelector('.flag-still')).not.toBeNull());
    expect(host.querySelector('.flag-still--staff')).not.toBeNull();
    pennant.setState('folded');
    expect(host.querySelector('.flag-still__pennant').dataset.state).toBe('folded');
    pennant.destroy();
  });
});
