// Shared browser glue of every instrument: the printed plate (issuer · title), the
// visible state sentence, one debounced polite live region, a rAF tween that stops when done
// (zero work when idle), and the value → rule → render → onChange loop.

import { ISSUER, RESULT_LINE } from './text.js';
import { h } from './dom.js';

export { nextId } from './dom.js';

const ANNOUNCE_DELAY = 450;

/**
 * Builds the compact plate inside `host`: the drawing (with an "E1 · ÖRNEK ENERJİ A.Ş."
 * tag in its corner), the controls, a one-line verdict, the live region and the result line.
 * `short` = [not fired, fired] verdicts printed in one grid cell so the height never changes.
 */
export function plate(host, { rule, title, short, hint }) {
  host.replaceChildren();
  const fig = h('figure', { class: `inst inst--${rule.toLowerCase()}`, 'data-fired': 'false' }, host);
  h('figcaption', { class: 'visually-hidden', text: `${title}. ${ISSUER}.` }, fig);
  const art = h('div', { class: 'inst__art' }, fig);
  const tag = h('p', { class: 'inst__tag', 'aria-hidden': 'true' }, art);
  if (/^E\d$/.test(rule)) h('span', { class: 'rule-code', text: rule }, tag);
  h('span', { class: 'inst__issuer', text: ISSUER }, tag);
  if (hint) h('span', { class: 'inst__hint', text: hint }, tag);
  const controls = h('div', { class: 'inst__controls' }, fig);
  const state = h('p', { class: 'inst__state' }, fig);
  if (short) short.forEach((text, i) => h('span', { class: i ? 'is-yes' : 'is-no', text }, state));
  const live = h('p', { class: 'visually-hidden', 'aria-live': 'polite' }, fig);
  h('p', { class: 'inst__result', text: RESULT_LINE }, fig);
  return { fig, art, controls, state, live };
}

/** requestAnimationFrame tween over `duration` ms; `cancel()` stops it and resolves `done`. */
export function tween(duration, onFrame) {
  let raf = 0;
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  const start = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    onFrame(t);
    if (t < 1) raf = requestAnimationFrame(frame);
    else finish();
  };
  raf = requestAnimationFrame(frame);
  return {
    done,
    cancel() {
      cancelAnimationFrame(raf);
      finish();
    },
  };
}

/**
 * The instrument loop. `evaluate(value)` → { fired, text, extra? }; `render(value, result, crossed)`
 * draws. `set(value, { quiet })` runs the loop; quiet skips the announcement (initial state).
 */
export function controller({ parts, rule, onChange, evaluate, render }) {
  let result = null;
  let value;
  let timer = 0;
  let muted = false;

  const announce = (text) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      parts.live.textContent = text;
    }, ANNOUNCE_DELAY);
  };

  const set = (next, { quiet = false } = {}) => {
    const prev = result;
    value = next;
    result = evaluate(next);
    const crossed = Boolean(prev) && prev.fired !== result.fired;
    parts.fig.dataset.fired = String(result.fired);
    if (result.short) parts.state.textContent = result.short;
    render(next, result, crossed);
    if (!quiet && !muted) announce(result.text);
    if (onChange) onChange({ rule, fired: result.fired, value: next, text: result.text, ...result.extra });
  };

  return {
    set,
    get value() {
      return value;
    },
    get result() {
      return result;
    },
    mute(on) {
      muted = on;
      if (!on && result) announce(result.text);
    },
    destroy() {
      clearTimeout(timer);
    },
  };
}

/** Converts a pointer event to the SVG's user units. */
export function svgPoint(svg, event) {
  const box = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  return {
    x: vb.x + ((event.clientX - box.left) / (box.width || 1)) * vb.width,
    y: vb.y + ((event.clientY - box.top) / (box.height || 1)) * vb.height,
  };
}

/** Pointer dragging on the drawing (mouse, pen, sideways touch); `onPoint` gets SVG coordinates. */
export function dragOn(svg, onPoint, onStart) {
  let active = false;
  const move = (event) => {
    if (active) onPoint(svgPoint(svg, event));
  };
  const down = (event) => {
    if (event.button > 0) return;
    active = true;
    if (onStart) onStart();
    svg.setPointerCapture?.(event.pointerId);
    move(event);
  };
  const up = () => {
    active = false;
  };
  svg.addEventListener('pointerdown', down);
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  return () => {
    svg.removeEventListener('pointerdown', down);
    svg.removeEventListener('pointermove', move);
    svg.removeEventListener('pointerup', up);
    svg.removeEventListener('pointercancel', up);
  };
}
