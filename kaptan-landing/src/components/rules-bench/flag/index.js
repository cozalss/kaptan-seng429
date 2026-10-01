// Sancak Tezgâhı pennants: the ICS numeral pennants 1–4 on an inked mast (desktop) or a small staff
// beside each article title (mobile). Canvas 2D cloth when motion is allowed; static SVG otherwise.
// Contract: research-b3/CONTRACT.md → "flag/index.js (C)".

import { assertState, mastLayout, staffLayout } from './halyard.js';
import { PENNANT_IDS, numeralOf } from './pennants.js';

// pennantSvg(id) (the static print) lives in ./svg.js; import it from there so it stays in the
// on-demand still chunk.

function canAnimate(host, reduced) {
  if (reduced) return false;
  const win = host.ownerDocument.defaultView;
  const canvas = host.ownerDocument.createElement('canvas');
  return Boolean(win && win.IntersectionObserver && win.ResizeObserver && canvas.getContext && canvas.getContext('2d'));
}

// Both renderers load on demand, so the bench chunk carries neither: the static print (still.js)
// only under reduced motion or without canvas, the cloth (live.js: stage, rig, cloth, draw) only
// when motion is allowed. States set meanwhile are replayed; a failed load leaves the decorative
// host empty (the article text carries the meaning) and marks it for QA.
function lazyView(load, make, options, label) {
  const queued = new Map();
  let view = null;
  let destroyed = false;
  load()
    .then((module) => {
      if (destroyed) return;
      view = make(module);
      queued.forEach((state, id) => view.setState(id, state));
      poses.forEach(([hoist, dip], id) => view.setPose?.(id, hoist, dip));
    })
    .catch(() => {
      options.host.dataset.flagError = label;
    });
  const poses = new Map();
  const check = (id) => {
    if (!options.ids.includes(id)) numeralOf(`${id} (not on this stage)`); // throws
  };
  return {
    setState(id, state) {
      assertState(state);
      check(id);
      if (view) view.setState(id, state);
      else queued.set(id, state);
    },
    setPose(id, hoist, dip = 0) {
      check(id);
      if (view) view.setPose?.(id, hoist, dip);
      else poses.set(id, [hoist, dip]);
    },
    gust(amount) {
      view?.gust?.(amount);
    },
    destroy() {
      destroyed = true;
      if (view) view.destroy();
    },
  };
}

/** The hero mast keeps its flying pennants above the host's `--mast-clear` (CSS px). */
const heroLayout = (host) => (width, height) => {
  const clear = parseFloat(host.ownerDocument.defaultView.getComputedStyle(host).getPropertyValue('--mast-clear'));
  return mastLayout(width, height, { hero: true, clear: Number.isFinite(clear) ? clear : 0 });
};
const loadStill = () => import('./still.js');
const loadLive = () => import('./live.js');

function lazyStill(options) {
  return lazyView(loadStill, ({ createStill }) => createStill(options), options, 'still');
}

function finePointer(win) {
  return Boolean(win.matchMedia && win.matchMedia('(hover: hover) and (pointer: fine)').matches);
}

/**
 * The mast holding E1–E4 (host: [data-mast]). `hero`: the chapter's large showpiece mast.
 * setState runs a timed hand-over-hand hoist; setPose(id, hoist 0..1, dip 0..1) is the scrubbed
 * alternative (the scroll moves the hand); gust(0..1) blows in proportion to scroll speed.
 * @param {{ host: HTMLElement, reduced?: boolean, hero?: boolean }} options
 * @returns {{ setState(id: string, state: 'down'|'hoisted'|'half'|'folded'): void,
 *   setPose(id: string, hoist: number, dip?: number): void, gust(amount: number): void, destroy(): void }}
 */
export function createMast({ host, reduced = false, hero = false }) {
  if (!host) throw new TypeError('createMast needs a host element');
  host.classList.add('flag-host', 'flag-host--mast');
  const ids = [...PENNANT_IDS];
  const stage = {
    host, ids, layout: hero ? heroLayout(host) : mastLayout, grid: [16, 9], weight: hero ? 1.35 : 1, spacing: hero ? 5.6 : 4.6,
    pointer: finePointer(host.ownerDocument.defaultView), className: 'flag-canvas',
  };
  const view = canAnimate(host, reduced)
    ? lazyView(loadLive, ({ createStage }) => createStage(stage), stage, 'live')
    : lazyStill({ host, ids, layout: hero ? heroLayout(host) : mastLayout, className: 'flag-still--mast' });
  return {
    setState: (id, state) => view.setState(id, state),
    setPose: (id, hoist, dip) => view.setPose(id, hoist, dip),
    gust: (amount) => view.gust(amount),
    destroy: () => {
      view.destroy();
      host.classList.remove('flag-host', 'flag-host--mast');
    },
  };
}

/**
 * One small pennant on a staff beside an article title (mobile; host: [data-pennant="E1"]).
 * @param {{ host: HTMLElement, id: string, reduced?: boolean }} options
 * @returns {{ setState(state: 'down'|'hoisted'|'half'|'folded'): void, destroy(): void }}
 */
export function createPennant({ host, id, reduced = false }) {
  if (!host) throw new TypeError('createPennant needs a host element');
  numeralOf(id);
  host.classList.add('flag-host', 'flag-host--staff');
  // phones: at most MAX_LIVE cloth canvases at a time, the rest printed (staff.js)
  const view = canAnimate(host, reduced)
    ? lazyView(loadLive, ({ createStaff }) => createStaff({ host, id, still: lazyStill }), { host, ids: [id] }, 'live')
    : lazyStill({ host, ids: [id], layout: staffLayout, className: 'flag-still--staff' });
  return {
    setState: (state) => view.setState(id, state),
    destroy: () => {
      view.destroy();
      host.classList.remove('flag-host', 'flag-host--staff');
    },
  };
}
