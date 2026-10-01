// Sancak Tezgâhı glue, with its parts injected (index.js passes the real ones, tests pass fakes).
// Instruments report whether their rule fires; the glue asks rules-check.js where each pennant may
// fly (filters can only lower it) and tells the mast. The rule switch (switch.js) picks the ONE
// instrument the shared slot shows. The first time the bench is seen it steps through E1 → E4 once
// (each rule fires, its pennant runs up); after that it belongs to the visitor.
// mode 'pose' (the pinned scroll showpiece, show.js): no tour and no timed hoists; the scroll
// drives the instruments and the mast through `instrument(id)`, `snapshot()` and `mast()`, and a
// visitor's pick is handed to `onPick` (which scrolls to that beat).

import { RULES, leakFilter, pennantState } from './rules-check.js';
import { createSwitch } from './switch.js';

export const ARTICLE_IDS = Object.freeze(Object.keys(RULES));
const AUTOPLAY_THRESHOLD = 0.45;
const TOUR_PAUSE_MS = 550;
const LEAK_AT_REST = 0;

/**
 * Reads a filter instrument's report: its own result (leakFilter / screenGates output) when given,
 * otherwise the leak's value or the screen's `fired` (a filter "fires" when it acts, i.e. lowers).
 */
export function readFilter(event) {
  if (event.rule === 'leak') return { leak: event.result === 'skip-or-halve' || leakFilter(event.value) !== 'pass' ? 'skip-or-halve' : 'pass' };
  return { screened: event.result ? event.result.pass === true : !event.fired };
}

const warn = (error) => console.warn('[kaptan] rules bench', error);

function safely(run) {
  try {
    return run();
  } catch (error) {
    warn(error);
    return null;
  }
}

/** Calls `onSeen()` once, the first time `target` is seen (at once without IntersectionObserver). */
function onceSeen(IO, target, threshold, onSeen) {
  if (!target) return () => {};
  if (typeof IO !== 'function') {
    onSeen();
    return () => {};
  }
  const observer = new IO((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    onSeen();
  }, { threshold });
  observer.observe(target);
  return () => observer.disconnect();
}

/**
 * @param {{
 *   section: HTMLElement | null,
 *   reduced?: boolean,
 *   hero?: boolean,
 *   mode?: 'tour' | 'pose',
 *   onPick?: (id: string) => void,
 *   parts: { createInstrument: Function, createMast: Function },
 *   IntersectionObserverImpl?: typeof IntersectionObserver,
 *   wait?: (ms: number) => Promise<void>,
 * }} options
 * @returns {{ destroy(): void, states(): Record<string, string>, current(): string | null,
 *   select(id: string): void, snapshot(): object, instrument(id: string): object | null, mast(): object | null }}
 */
export function mountBench({
  section,
  reduced = false,
  hero = false,
  mode = 'tour',
  onPick = () => {},
  parts,
  IntersectionObserverImpl = globalThis.IntersectionObserver,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!section) return { destroy() {}, states: () => ({}), current: () => null, select() {}, snapshot: () => ({}), instrument: () => null, mast: () => null };
  const posed = mode === 'pose';

  const fired = Object.fromEntries(ARTICLE_IDS.map((id) => [id, false]));
  const filters = { screened: true, leak: 'pass' };
  let leakValue = LEAK_AT_REST;
  const shown = Object.fromEntries(ARTICLE_IDS.map((id) => [id, 'down']));
  let mast = null;

  const apply = ({ force = false } = {}) => {
    ARTICLE_IDS.forEach((id) => {
      const state = pennantState(fired[id], filters);
      if (!force && state === shown[id]) return;
      shown[id] = state;
      if (mast && !posed) safely(() => mast.setState(id, state));
      const row = section.querySelector(`.articles > [data-rule="${id}"]`);
      if (row) row.dataset.pennantState = state;
    });
  };

  const onChange = (event) => {
    if (!event) return;
    if (event.rule in fired) fired[event.rule] = event.fired === true;
    else if (event.rule === 'leak' || event.rule === 'screen') {
      Object.assign(filters, readFilter(event));
      if (event.rule === 'leak' && Number.isFinite(event.value)) leakValue = event.value;
    } else return;
    apply();
  };

  const instruments = new Map();
  section.querySelectorAll('[data-instrument]').forEach((host) => {
    const rule = host.dataset.instrument;
    const instrument = safely(() => parts.createInstrument({ host, rule, reduced, onChange }));
    if (instrument) instruments.set(rule, instrument);
  });
  // The mast after the instruments: the hero mast measures the plate that overlaps its foot.
  const mastHost = section.querySelector('[data-mast]');
  mast = mastHost ? safely(() => parts.createMast({ host: mastHost, reduced, hero })) : null;
  apply({ force: true });

  const play = (id) =>
    Promise.resolve()
      .then(() => instruments.get(id)?.autoplay?.())
      .catch(warn);
  const tour = { stopped: false };
  const picker = safely(() =>
    createSwitch({
      section,
      onSelect: (id, { user }) => {
        // The leak is a what-if: leaving it puts the price line back at rest (pennants fly again).
        if (id !== 'leak') safely(() => instruments.get('leak')?.set?.(LEAK_AT_REST));
        if (!user) return;
        tour.stopped = true;
        if (posed) safely(() => onPick(id));
        else play(id);
      },
    }),
  );

  const bench = section.querySelector('.rules__bench');
  const stopTour = () => {
    tour.stopped = true;
  };
  bench?.addEventListener('pointerdown', stopTour, true);
  bench?.addEventListener('keydown', stopTour, true);

  // Reduced motion: every rule's fired state is printed at once (no stepping).
  const runTour = async () => {
    if (reduced || !picker) {
      ARTICLE_IDS.forEach(play);
      return;
    }
    for (const id of ARTICLE_IDS) {
      if (tour.stopped) return;
      picker.select(id);
      await play(id);
      if (tour.stopped) return;
      await wait(TOUR_PAUSE_MS);
    }
  };
  // The list, not the bench wrapper: on wide screens the wrapper is display: contents (no box).
  const stopSeen = posed
    ? () => {}
    : onceSeen(IntersectionObserverImpl, section.querySelector('.articles'), AUTOPLAY_THRESHOLD, () => {
        runTour().catch(warn);
      });

  return {
    states: () => ({ ...shown }),
    current: () => picker?.current() ?? null,
    select: (id) => safely(() => picker?.select(id)),
    snapshot: () => ({ fired: { ...fired }, ...filters, leakValue }),
    instrument: (id) => instruments.get(id) ?? null,
    mast: () => mast,
    destroy() {
      tour.stopped = true;
      stopSeen();
      bench?.removeEventListener('pointerdown', stopTour, true);
      bench?.removeEventListener('keydown', stopTour, true);
      safely(() => picker?.destroy());
      instruments.forEach((instrument) => safely(() => instrument.destroy()));
      instruments.clear();
      if (mast) safely(() => mast.destroy());
      section.querySelectorAll('.articles > [data-rule]').forEach((row) => delete row.dataset.pennantState);
    },
  };
}
