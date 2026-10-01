// Live plates for the agent detail page: a small ink diorama of the agent at work, drawn on a 2D
// canvas (never WebGL — the page's one GL slot belongs to the hero's sea). createAgentScene()
// fills a host element with the plate (canvas, caption, a visually hidden description), loads the
// agent's scene module and its faces, and runs it only while it is started, on screen and the tab
// is visible. Reduced motion draws one still. The API and the style rules are in SCENES.md.

import { h } from '../dom.js';
import { fontsReady } from './fonts.js';
import { SCENE_LOADERS, hasAgentScene } from './registry.js';
import { advance, canDraw2D, sceneDpr } from './settings.js';
import { KEY_COUNT, KEY_STRIDE, createKeyBuffer } from './keys.js';
import { inkWeightFor, weightLines } from './ink-weight.js';

export { hasAgentScene };

const PERF_WINDOW = 120;

function buildPlate(host) {
  const canvas = h('canvas', { class: 'agent-scene__canvas' });
  // the plate's letters, set in HTML over the drawing where the scene points them (keys.js)
  const pins = Array.from({ length: KEY_COUNT }, () => h('span', { class: 'agent-scene__pin' }));
  const stage = h('div', { class: 'agent-scene__stage', 'aria-hidden': 'true' }, canvas, ...pins);
  const legend = h('span', { class: 'agent-scene__legend' });
  // read aloud: one sentence on what the plate shows, then its title and legend
  const description = h('span', { class: 'visually-hidden agent-scene__summary' });
  const caption = h(
    'p',
    { class: 'agent-scene__caption' },
    description,
    h('span', { class: 'agent-scene__title' }, 'Canlı şema · Temsili'),
    legend,
  );
  host.replaceChildren(stage, caption);
  return { canvas, stage, pins, legend, description };
}

// A letter keeps this far (CSS px) inside the plate's frame, never crossing its rule.
const PIN_INSET = 14;

/** Moves the HTML letters to where the scene last placed them (only on change). */
function createPinWriter(pins, keys, size) {
  const shown = new Float32Array(keys.length).fill(-1);
  // (no size yet: unclamped)
  const inside = (v, max) => (max > 0 ? Math.min(Math.max(v, PIN_INSET), Math.max(PIN_INSET, max - PIN_INSET)) : v);
  return () => {
    for (let i = 0; i < pins.length; i += 1) {
      const o = i * KEY_STRIDE;
      const x = Math.round(inside(keys[o], size.width) * 2) / 2;
      const y = Math.round(inside(keys[o + 1], size.height) * 2) / 2;
      const alpha = Math.round(keys[o + 2] * 20) / 20;
      if (x === shown[o] && y === shown[o + 1] && alpha === shown[o + 2]) continue;
      shown[o] = x;
      shown[o + 1] = y;
      shown[o + 2] = alpha;
      pins[i].style.transform = `translate(${x}px, ${y}px)`;
      pins[i].style.opacity = String(alpha);
    }
  };
}

function fillCopy(plate, scene) {
  plate.description.textContent = scene.summary ?? scene.description;
  scene.legend.forEach(({ key }, i) => {
    if (plate.pins[i]) plate.pins[i].textContent = key;
  });
  plate.legend.replaceChildren(
    ...scene.legend.flatMap(({ key, text }, i) => [
      ...(i ? [' · '] : []),
      h('span', { class: 'agent-scene__key' }, key),
      ` ${text}`,
    ]),
  );
}

/** Rolling render-time stats (ms), exposed on window in dev for the QA scripts. */
function createPerf(win) {
  const samples = new Float32Array(PERF_WINDOW);
  let count = 0;
  return {
    add(ms) {
      samples[count % PERF_WINDOW] = ms;
      count += 1;
      if (!import.meta.env?.DEV || count % 30 !== 0) return;
      const n = Math.min(count, PERF_WINDOW);
      const sorted = Array.from(samples.subarray(0, n)).sort((a, b) => a - b);
      win.__agentScenePerf = {
        frames: count,
        avgMs: sorted.reduce((sum, v) => sum + v, 0) / n,
        p95Ms: sorted[Math.floor(n * 0.95) - 1] ?? sorted[n - 1],
        maxMs: sorted[n - 1],
      };
    },
  };
}

/**
 * @param {{ host: HTMLElement, agentId: string, reduced?: boolean, win?: Window, loaders?: typeof SCENE_LOADERS }} options
 * @returns {{ start: () => void, stop: () => void, destroy: () => void, ready: Promise<boolean> } | null}
 *   null when the agent has no plate or no 2D canvas can be had (show nothing then).
 */
export function createAgentScene({ host, agentId, reduced = false, win = window, loaders = SCENE_LOADERS }) {
  if (!host || !hasAgentScene(agentId, loaders) || !canDraw2D(win)) return null;
  const doc = host.ownerDocument;
  const plate = buildPlate(host);
  const perf = createPerf(win);
  const live = { scene: null, def: null, elapsed: 0, started: false, onScreen: true, destroyed: false, raf: 0, last: 0, weight: 1, unweight: () => {} };
  const keys = createKeyBuffer();
  const size = { width: 0, height: 0 };
  const placePins = createPinWriter(plate.pins, keys, size);

  function draw() {
    if (!live.scene) return;
    const t0 = win.performance.now();
    live.scene.render(reduced ? live.def.stillElapsed : live.elapsed);
    perf.add(win.performance.now() - t0);
    placePins();
  }

  const shouldRun = () => live.started && !reduced && live.scene && live.onScreen && !doc.hidden && !live.destroyed;

  function tick(now) {
    live.raf = 0;
    if (!shouldRun()) return;
    live.elapsed = advance(live.elapsed, live.last ? now - live.last : 0);
    live.last = now;
    draw();
    live.raf = win.requestAnimationFrame(tick);
  }

  function sync() {
    if (shouldRun()) {
      if (!live.raf) {
        live.last = 0;
        live.raf = win.requestAnimationFrame(tick);
      }
      return;
    }
    if (live.raf) win.cancelAnimationFrame(live.raf);
    live.raf = 0;
  }

  function resize() {
    if (!live.scene) return;
    const width = plate.stage.clientWidth;
    const height = plate.stage.clientHeight;
    if (!width || !height) return;
    size.width = width;
    size.height = height;
    live.weight = inkWeightFor(width);
    live.scene.setSize(width, height, sceneDpr(win.devicePixelRatio, width * height));
    if (live.started || reduced) draw(); // a resized canvas is blank until drawn
  }

  const resizeObserver = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resize) : null;
  const visibility = typeof win.IntersectionObserver === 'function'
    ? new win.IntersectionObserver((entries) => {
        live.onScreen = entries[entries.length - 1].isIntersecting;
        sync();
      })
    : null;
  const onVisibility = () => sync();
  doc.addEventListener('visibilitychange', onVisibility);

  const ready = (async () => {
    try {
      const [module] = await Promise.all([loaders[agentId](), fontsReady(doc)]);
      if (live.destroyed) return false;
      live.def = module.default;
      fillCopy(plate, live.def);
      // the same context the scene will get: its strokes are weighted to the plate's size
      live.unweight = weightLines(plate.canvas.getContext?.('2d', { alpha: true }), () => live.weight);
      live.scene = live.def.create({ canvas: plate.canvas, keys });
      resizeObserver?.observe(plate.stage);
      visibility?.observe(host);
      resize();
      if (live.started) draw();
      sync();
      return true;
    } catch (error) {
      console.error('[kaptan] agent scene failed', error);
      host.hidden = true;
      return false;
    }
  })();

  return {
    ready,
    /** Runs the plate from where it paused (reduced motion: draws its still). */
    start() {
      if (live.destroyed) return;
      live.started = true;
      draw();
      sync();
    },
    /** Freezes the plate on its current frame. */
    stop() {
      live.started = false;
      sync();
    },
    destroy() {
      if (live.destroyed) return;
      live.destroyed = true;
      live.started = false;
      sync();
      resizeObserver?.disconnect();
      visibility?.disconnect();
      doc.removeEventListener('visibilitychange', onVisibility);
      live.scene?.dispose();
      live.scene = null;
      live.unweight();
      host.replaceChildren();
    },
  };
}
