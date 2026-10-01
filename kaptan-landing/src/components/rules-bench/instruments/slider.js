// A slider instrument: a real <input type="range"> styled as an ink rule (keyboard, touch and
// screen readers come from the browser), a drawing that reacts, and a one-time autoplay that
// walks the value from just below the threshold across it.

import { controller, nextId, plate, tween } from './base.js';
import { h } from './dom.js';
import { SHORT } from './text.js';
import { clamp, easeInOut, map, snap } from './motion.js';

const AUTOPLAY_MS = 1700;
const HOLD = 0.18; // the first part of the autoplay only shows the preset

export function sliderInstrument({ host, rule, reduced, onChange }, spec) {
  const parts = plate(host, { rule, title: spec.title, short: SHORT[rule], hint: spec.hint });
  const id = nextId('inst-range');
  const frac = (v) => clamp(map(v, spec.min, spec.max, 0, 1), 0, 1);

  // one row: the ink rule (a real range, 44px tall) with the threshold tick, then the value
  const wrap = h('div', { class: 'inst__slider' }, parts.controls);
  h('label', { for: id, class: 'visually-hidden', text: spec.label }, wrap);
  const track = h('div', { class: 'inst__track' }, wrap);
  const input = h(
    'input',
    { type: 'range', id, class: 'inst__range', min: spec.min, max: spec.max, step: spec.step },
    track,
  );
  track.style.setProperty('--at', frac(spec.threshold));
  h('span', { class: 'inst__tick', 'aria-hidden': 'true' }, track);
  const out = h('output', { class: 'inst__value', for: id }, wrap);

  let played = false;
  let owned = false; // once the visitor has touched it, nothing drives it any more
  let run = null;
  const claim = () => {
    played = true;
    owned = true;
    if (run) run.cancel();
  };

  let ctl;
  const art = spec.draw(parts.art, {
    reduced,
    set: (v) => {
      claim();
      ctl.set(snap(v, spec));
    },
    redraw: () => ctl.set(ctl.value),
  });

  ctl = controller({
    parts,
    rule,
    onChange,
    evaluate: spec.evaluate,
    render(v, result, crossed) {
      if (Number(input.value) !== v) input.value = String(v);
      input.setAttribute('aria-valuetext', spec.valuetext(v, result.fired));
      input.style.setProperty('--p', frac(v));
      out.textContent = spec.format(v);
      art.update(v, result, crossed);
    },
  });

  const onInput = () => {
    claim();
    ctl.set(snap(Number(input.value), spec));
  };
  input.addEventListener('input', onInput);
  parts.fig.addEventListener('keydown', claim);
  parts.fig.addEventListener('pointerdown', claim);
  ctl.set(spec.preset, { quiet: true });

  return {
    autoplay() {
      if (played) return Promise.resolve();
      played = true;
      if (reduced) {
        ctl.set(spec.target);
        return Promise.resolve();
      }
      const from = ctl.value;
      ctl.mute(true);
      run = tween(AUTOPLAY_MS, (t) => {
        const p = easeInOut(clamp((t - HOLD) / (1 - HOLD), 0, 1));
        const v = snap(from + (spec.target - from) * p, spec);
        if (v !== ctl.value) ctl.set(v);
      });
      return run.done.then(() => {
        run = null;
        ctl.mute(false);
      });
    },
    set(v) {
      ctl.set(snap(Number(v), spec));
    },
    /** Scrubbed autoplay (the pinned scroll sequence): 0 = preset … 1 = past the threshold. Silent. */
    progress(t) {
      if (owned) return;
      played = true;
      if (run) run.cancel();
      const v = snap(spec.preset + (spec.target - spec.preset) * clamp(t, 0, 1), spec);
      if (v !== ctl.value) ctl.set(v, { quiet: true });
    },
    destroy() {
      claim();
      input.removeEventListener('input', onInput);
      parts.fig.removeEventListener('keydown', claim);
      parts.fig.removeEventListener('pointerdown', claim);
      if (art.destroy) art.destroy();
      ctl.destroy();
      host.replaceChildren();
    },
  };
}
