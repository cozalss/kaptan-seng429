// Browser glue for a pennant canvas: sizes it to its host (DPR ≤ 1.5), rigs the pennants, runs them
// on the shared ticker only while the host is on screen and something moves, and wakes them for a
// state change, an occasional gust, or (fine pointers only) a hand passing near the cloth.

import { makeCanvas } from '../../../lib/ink3d/ink.js';
import { drawHalyard, drawMast, drawPennant } from './draw.js';
import { assertState } from './halyard.js';
import { blow, createRig, isResting, setRigPose, setRigState, settleRig, stepRig } from './rig.js';
import { numeralOf } from './pennants.js';
import { subscribe } from './ticker.js';

const MAX_DPR = 1.5;
const IDLE_GUST = [20000, 34000]; // ms between idle gusts while on screen
const POKE_RADIUS = 38;

/**
 * @param {{ host: HTMLElement, ids: string[], layout: (w: number, h: number) => object,
 *   grid: [number, number], weight: number, spacing: number, pointer: boolean, className: string }} o
 *   weight: line-weight scale; spacing: hatch pitch in CSS px
 */
export function createStage({ host, ids, layout: layoutOf, grid, weight, spacing, pointer, className }) {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const canvas = makeCanvas(doc, 1, 1);
  canvas.className = className;
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const states = Object.fromEntries(ids.map((id) => [id, 'down']));
  const poses = new Map(); // scrubbed mode: id → [hoist, dip]
  const pins = new Float32Array(ids.length * 2);
  const order = ids.map((_, k) => k);
  let rigs = [];
  let layout = null;
  let mastLayer = null;
  let dpr = 1;
  let visible = false;
  let stop = null;
  let gustTimer = 0;
  let poke = null;
  let destroyed = false;

  function build() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h || !ctx) return;
    dpr = Math.min(MAX_DPR, win.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    layout = layoutOf(w, h);
    rigs = ids.map((id, k) => {
      const rig = createRig({
        id, cols: grid[0], rows: grid[1], length: layout.length, hoist: layout.hoist,
        spot: layout.spots[k], x: layout.halyard, state: states[id], seed: k + 1, spacing,
      });
      const pose = poses.get(id);
      if (pose) setRigPose(rig, pose[0], pose[1]);
      settleRig(rig);
      return rig;
    });
    mastLayer = makeCanvas(doc, canvas.width, canvas.height);
    const mctx = mastLayer.getContext('2d');
    if (mctx) {
      mctx.scale(dpr, dpr);
      drawMast(mctx, layout, { weight });
    }
    draw();
    wake();
  }

  function draw() {
    if (!ctx || !layout) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (mastLayer) ctx.drawImage(mastLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // halyard runs through the hoists in the order they sit on it
    for (let k = 0; k < rigs.length; k += 1) {
      let j = k;
      while (j > 0 && rigs[order[j - 1]].env.oy > rigs[k].env.oy) {
        order[j] = order[j - 1];
        j -= 1;
      }
      order[j] = k;
    }
    for (let k = 0; k < rigs.length; k += 1) {
      const rig = rigs[order[k]];
      pins[k * 2] = rig.env.oy;
      pins[k * 2 + 1] = rig.env.oy + layout.hoist * rig.hoistScale;
    }
    drawHalyard(ctx, layout.halyard, layout.top, layout.base - 10 * weight, pins, rigs.length * 2, weight);
    // travelling pennants pass behind the ones at rest
    for (let pass = 0; pass < 2; pass += 1) {
      for (let k = 0; k < rigs.length; k += 1) {
        if (rigs[k].halyard.moving === (pass === 0)) drawPennant(ctx, rigs[k].cloth, rigs[k].art, weight, rigs[k].furl);
      }
    }
  }

  function frame(dt) {
    let moved = false;
    for (let k = 0; k < rigs.length; k += 1) moved = stepRig(rigs[k], dt, poke) || moved;
    poke = null;
    if (moved) draw();
    if (rigs.every(isResting)) sleep();
  }

  function scheduleGust() {
    win.clearTimeout(gustTimer);
    if (!visible || destroyed) return;
    const wait = IDLE_GUST[0] + Math.random() * (IDLE_GUST[1] - IDLE_GUST[0]);
    gustTimer = win.setTimeout(() => {
      const flying = rigs.filter((r) => r.target.wind > 0);
      if (flying.length) {
        flying.forEach((r) => blow(r, 'idle'));
        wake();
      }
      scheduleGust();
    }, wait);
  }

  function wake() {
    if (stop || !visible || destroyed || !rigs.length) return;
    stop = subscribe(frame);
  }

  function sleep() {
    if (stop) stop();
    stop = null;
  }

  const io = new win.IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) {
      wake();
      scheduleGust();
    } else {
      sleep();
      win.clearTimeout(gustTimer);
    }
  });
  io.observe(host);

  let resizeFrame = 0;
  const ro = new win.ResizeObserver(() => {
    win.cancelAnimationFrame(resizeFrame);
    resizeFrame = win.requestAnimationFrame(build);
  });
  ro.observe(host);

  let last = null;
  const onMove = (event) => {
    if (event.pointerType !== 'mouse' || !layout) return;
    const box = canvas.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    const now = event.timeStamp;
    if (last && now > last.t) {
      const dt = (now - last.t) / 1000;
      poke = { x, y, vx: (x - last.x) / dt, vy: (y - last.y) / dt, r: POKE_RADIUS };
      if (rigs.some((r) => r.target.wind > 0 && Math.abs(r.env.oy + layout.hoist / 2 - y) < layout.hoist)) {
        rigs.forEach((r) => blow(r, 'touch'));
        wake();
      }
    }
    last = { x, y, t: now };
  };
  const onLeave = () => {
    last = null;
  };
  if (pointer) {
    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerleave', onLeave, { passive: true });
  }

  build();

  return {
    setState(id, state) {
      assertState(state);
      const k = ids.indexOf(id);
      if (k < 0) numeralOf(`${id} (not on this stage)`); // throws a TypeError naming the id
      if (states[id] === state) return;
      states[id] = state;
      if (!rigs[k]) return;
      setRigState(rigs[k], state);
      if (visible) wake();
      else {
        settleRig(rigs[k]);
        draw();
      }
    },
    /** Scrubbed hoist (0 at the foot … 1 at the slot) and dip (0 … 1 half-mast), from the scroll. */
    setPose(id, hoist, dip = 0) {
      const k = ids.indexOf(id);
      if (k < 0) numeralOf(`${id} (not on this stage)`); // throws a TypeError naming the id
      const last = poses.get(id);
      if (last && last[0] === hoist && last[1] === dip) return;
      poses.set(id, [hoist, dip]);
      if (!rigs[k]) return;
      setRigPose(rigs[k], hoist, dip);
      if (visible) wake();
      else {
        settleRig(rigs[k]);
        draw();
      }
    },
    /** A gust in proportion to how fast the page is being scrolled (0..1). */
    gust(amount) {
      if (!visible || !(amount > 0.05)) return;
      rigs.forEach((rig) => {
        if (rig.target.wind > 0) blow(rig, 'scroll', amount);
      });
      wake();
    },
    destroy() {
      destroyed = true;
      sleep();
      win.clearTimeout(gustTimer);
      win.cancelAnimationFrame(resizeFrame);
      io.disconnect();
      ro.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      canvas.remove();
      rigs = [];
    },
  };
}
