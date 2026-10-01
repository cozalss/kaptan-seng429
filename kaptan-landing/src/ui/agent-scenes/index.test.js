import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentScene } from './index.js';

function fakeWindow() {
  const frames = new Map();
  let id = 0;
  let now = 0;
  const observers = [];
  const win = {
    CanvasRenderingContext2D: function Ctx() {},
    document: { createElement: () => ({ getContext: () => ({}) }) },
    devicePixelRatio: 2,
    performance: { now: () => now },
    requestAnimationFrame: (cb) => {
      id += 1;
      frames.set(id, cb);
      return id;
    },
    cancelAnimationFrame: (handle) => frames.delete(handle),
    IntersectionObserver: class {
      constructor(cb) {
        this.cb = cb;
        this.observed = [];
        observers.push(this);
      }
      observe(el) {
        this.observed.push(el);
      }
      disconnect() {
        this.observed = [];
      }
    },
  };
  return {
    win,
    pending: () => frames.size,
    /** Runs the queued frames at +ms. */
    step(ms = 16) {
      now += ms;
      const due = [...frames.entries()];
      frames.clear();
      due.forEach(([, cb]) => cb(now));
    },
    setOnScreen(on) {
      observers.forEach((o) => o.cb([{ isIntersecting: on }]));
    },
  };
}

function stubScene() {
  const scene = { renders: [], sizes: [], disposed: false };
  const def = {
    legend: [
      { key: 'a', text: 'gelen' },
      { key: 'b', text: 'okuma' },
    ],
    description: 'Temsili canlı şema.',
    stillElapsed: 7,
    create: ({ keys }) => ({
      setSize: (...args) => scene.sizes.push(args),
      render: (elapsed) => {
        scene.renders.push(elapsed);
        keys?.set([10, 20, 1], 0);
      },
      dispose: () => {
        scene.disposed = true;
      },
    }),
  };
  return { scene, loaders: { test: () => Promise.resolve({ default: def }) } };
}

describe('createAgentScene', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows nothing for an agent without a plate, or without a 2D canvas', () => {
    const host = document.createElement('div');
    expect(createAgentScene({ host, agentId: 'kanit' })).toBeNull();
    expect(createAgentScene({ host, agentId: 'siniflandirici' })).toBeNull(); // jsdom: no canvas
    expect(host.childElementCount).toBe(0);
  });

  it('builds the plate: a hidden canvas with its letters, a readable caption and a one-sentence summary', async () => {
    const host = document.createElement('div');
    const { win } = fakeWindow();
    const { loaders } = stubScene();
    const plate = createAgentScene({ host, agentId: 'test', win, loaders });
    expect(await plate.ready).toBe(true);
    expect(host.querySelector('.agent-scene__stage').getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('canvas')).not.toBeNull();
    expect(host.querySelector('.agent-scene__caption').hasAttribute('aria-hidden')).toBe(false);
    expect(host.querySelector('.agent-scene__summary').textContent).toBe('Temsili canlı şema.');
    expect(host.querySelector('.agent-scene__caption').textContent).toBe('Temsili canlı şema.Canlı şema · Temsilia gelen · b okuma');
    expect([...host.querySelectorAll('.agent-scene__pin')].map((pin) => pin.textContent)).toEqual(['a', 'b', '']);
    plate.destroy();
  });

  it('sets the letters over the drawing where the scene placed them', async () => {
    const host = document.createElement('div');
    const { win } = fakeWindow();
    const { loaders } = stubScene();
    const plate = createAgentScene({ host, agentId: 'test', win, loaders, reduced: true });
    await plate.ready;
    plate.start();
    const [a] = host.querySelectorAll('.agent-scene__pin');
    expect(a.style.transform).toBe('translate(10px, 20px)');
    expect(a.style.opacity).toBe('1');
    plate.destroy();
  });

  it('runs only while started and on screen, and resumes where it paused', async () => {
    const host = document.createElement('div');
    const fake = fakeWindow();
    const { scene, loaders } = stubScene();
    const plate = createAgentScene({ host, agentId: 'test', win: fake.win, loaders });
    await plate.ready;
    expect(fake.pending()).toBe(0); // not started: no frames
    plate.start();
    fake.step(16); // first frame just stamps the clock
    fake.step(50);
    fake.step(50);
    const t = scene.renders[scene.renders.length - 1];
    expect(t).toBeCloseTo(0.1, 5);
    fake.setOnScreen(false);
    expect(fake.pending()).toBe(0);
    fake.setOnScreen(true);
    fake.step(1000); // the gap while away is not counted
    fake.step(20);
    expect(scene.renders[scene.renders.length - 1]).toBeCloseTo(0.12, 5);
    plate.stop();
    expect(fake.pending()).toBe(0);
    plate.destroy();
    expect(scene.disposed).toBe(true);
    expect(host.childElementCount).toBe(0);
    plate.start(); // no-op once destroyed
    expect(fake.pending()).toBe(0);
  });

  it('pauses while the tab is hidden', async () => {
    const host = document.createElement('div');
    const fake = fakeWindow();
    const { loaders } = stubScene();
    const plate = createAgentScene({ host, agentId: 'test', win: fake.win, loaders });
    await plate.ready;
    plate.start();
    expect(fake.pending()).toBe(1);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fake.pending()).toBe(0);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fake.pending()).toBe(1);
    hidden.mockRestore();
    plate.destroy();
  });

  it('draws one still under reduced motion and never loops', async () => {
    const host = document.createElement('div');
    const fake = fakeWindow();
    const { scene, loaders } = stubScene();
    const plate = createAgentScene({ host, agentId: 'test', reduced: true, win: fake.win, loaders });
    await plate.ready;
    plate.start();
    expect(scene.renders).toEqual([7]);
    expect(fake.pending()).toBe(0);
    plate.destroy();
  });

  it('hides its host if the scene fails to load', async () => {
    const host = document.createElement('div');
    const { win } = fakeWindow();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const plate = createAgentScene({ host, agentId: 'test', win, loaders: { test: () => Promise.reject(new Error('chunk')) } });
    expect(await plate.ready).toBe(false);
    expect(host.hidden).toBe(true);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
