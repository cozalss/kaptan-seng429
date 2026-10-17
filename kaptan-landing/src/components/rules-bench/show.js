// Sancak Tezgâhı, the pinned scroll sequence (wide screens, full motion). Entering, the title
// assembles out of its masks, the mast is inked from the foot up and the sea strokes are drawn.
// Then the stage pins and the scroll walks the rules: E1 → E4, each one's instrument crosses its
// threshold and its pennant runs up the halyard (scrubbed, with the scroll's speed as wind); last,
// the leak line climbs past 8 %, every pennant dips to half-mast and rises again as the pin lets go.
// The pose is a pure function of the scroll (beats.js), so scrolling back plays it backwards.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { BEAT_LABELS, RULE_IDS, beatProgress, labelFor, poseAt, smooth } from './beats.js';

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin);

const PIN_SCREENS = 1.8; // the pinned sequence takes 1.8 viewport heights of scroll
const SCRUB = 0.6;
const SNAP = { snapTo: 'labels', duration: { min: 0.25, max: 0.7 }, delay: 0.08, ease: 'power2.inOut' };
const GUST_SPEED = 2400; // px/s of scroll that blows a full gust
const GUST_EVERY_MS = 260;
const FILTER_REST = 0.6; // the filter line's opacity before its beat (projector rule: still readable)
const LEAK_DIP = [8, 9.5]; // leak rise (%) over which the pennants dip to half-mast

const $$ = (root, selector) => [...root.querySelectorAll(selector)];

/** One printed copy of each rule's line under the list (aria-hidden: the list keeps the real one). */
function buildCaptions(section) {
  const caption = document.createElement('div');
  caption.className = 'rules__caption';
  caption.setAttribute('aria-hidden', 'true');
  $$(section, '.articles > [data-rule]').forEach((row) => {
    const cap = document.createElement('p');
    cap.className = 'rules__cap';
    cap.dataset.rule = row.dataset.rule;
    cap.innerHTML = row.querySelector('.article__line')?.innerHTML ?? '';
    caption.append(cap);
  });
  section.querySelector('.articles')?.after(caption);
  return caption;
}

function addUnderlines(section) {
  return $$(section, '.articles > [data-rule]').map((row) => {
    const line = document.createElement('span');
    line.className = 'rules__underline';
    line.setAttribute('aria-hidden', 'true');
    row.append(line);
    return line;
  });
}

/** Scrubbed entrance: from the stage's top at 85 % of the viewport to the pin. */
function buildIntro(section) {
  const title = section.querySelector('.rules__title');
  const split = title ? SplitText.create(title, { type: 'words,chars', mask: 'words', wordsClass: 'rules__word' }) : null;
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  if (split) tl.from(split.chars, { yPercent: 118, duration: 0.55, stagger: 0.014 }, 0);
  // Everything else inks in from the left (DESIGN.md §5: motion is a printing verb).
  // The open clip overhangs the box so a focus ring (2px, offset 2px) is never cut.
  const ink = { clipPath: 'inset(-20% 110% -20% -10%)' };
  const inked = { clipPath: 'inset(-20% -10% -20% -10%)', ease: 'power2.inOut' };
  tl.fromTo(section.querySelector('.rules__lead'), ink, { ...inked, duration: 0.45 }, 0.3)
    .fromTo(section.querySelector('.rules__sky'), { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.85, ease: 'power2.inOut' }, 0.05)
    .from($$(section, '.rules__sea path'), { drawSVG: '0%', duration: 0.55, stagger: 0.07, ease: 'power2.inOut' }, 0.35)
    .fromTo($$(section, '.articles > [data-rule]'), ink, { ...inked, duration: 0.4, stagger: 0.06 }, 0.42)
    .fromTo([section.querySelector('.rules__caption'), section.querySelector('.rules__slot')], ink, { ...inked, duration: 0.45, stagger: 0.08 }, 0.6);
  return { tl, split };
}

/**
 * How far the scroll must follow the chapter's change of height so the page on screen stays put:
 * the growth when the chapter's head had scrolled away and its foot was on screen or above it (the
 * show arrived lazily while the reader was past it: scrolling back up from Rota, a jump, a deep
 * link), otherwise 0 (the room opens below what the reader sees).
 * @param {{ top: number, bottom: number, height: number }} before the section's box before the pin
 * @param {number} height the section's height with the pin's scroll room
 * @param {number} viewportHeight
 */
export function scrollShiftFor(before, height, viewportHeight) {
  return before.top < 0 && before.bottom < viewportHeight ? height - before.height : 0;
}

/**
 * @param {{ section: HTMLElement, bench: ReturnType<import('./bench.js').mountBench>,
 *   scroller?: { scrollToY(y: number, options?: object): void, shift?(dy: number): void } }} options
 * @returns {{ goTo(id: string): void, destroy(): void }}
 */
export function createShow({ section, bench, scroller }) {
  const stage = section.querySelector('.rules__stage');
  if (!stage) return { goTo() {}, destroy() {} };
  const before = section.getBoundingClientRect();
  section.dataset.show = 'pin';

  const caption = buildCaptions(section);
  const caps = $$(caption, '.rules__cap');
  const underlines = addUnderlines(section);
  const scaleOf = underlines.map((line) => gsap.quickSetter(line, 'scaleX'));
  const filter = section.querySelector('#filtre-sizinti');
  const setFilter = filter ? gsap.quickSetter(filter, 'opacity') : () => {};
  const last = { slot: null, inst: {}, gust: 0 };

  const setInstrument = (id, t) => {
    const value = Math.round(t * 1000) / 1000;
    if (last.inst[id] === value) return;
    last.inst[id] = value;
    bench.instrument(id)?.progress?.(value);
  };

  const render = (p) => {
    const pose = poseAt(p);
    if (pose.slot !== last.slot) {
      last.slot = pose.slot;
      bench.select(pose.slot);
      caps.forEach((cap, k) => cap.classList.toggle('is-active', k === pose.active));
    }
    RULE_IDS.forEach((id, k) => {
      setInstrument(id, pose.instrument[id]);
      scaleOf[k](beatProgress(p, k));
    });
    setInstrument('leak', pose.leak);
    setFilter(FILTER_REST + (1 - FILTER_REST) * pose.filterInk);

    const mast = bench.mast();
    if (!mast) return;
    const { fired = {}, leak, leakValue = 0 } = bench.snapshot();
    const dip = leak === 'skip-or-halve' ? smooth(LEAK_DIP[0], LEAK_DIP[1], leakValue) : 0;
    RULE_IDS.forEach((id, k) => mast.setPose(id, fired[id] ? pose.gate[k] : 0, dip));
  };

  const gust = (self) => {
    const now = performance.now();
    if (now - last.gust < GUST_EVERY_MS) return;
    const speed = Math.abs(self.getVelocity());
    if (speed < GUST_SPEED * 0.08) return;
    last.gust = now;
    bench.mast()?.gust?.(Math.min(1, speed / GUST_SPEED));
  };

  const intro = buildIntro(section);
  const introTrigger = ScrollTrigger.create({ trigger: section, start: 'top 85%', end: 'top top', scrub: SCRUB, animation: intro.tl });

  const proxy = { p: 0 };
  const tl = gsap.timeline();
  tl.to(proxy, { p: 1, duration: 1, ease: 'none', onUpdate: () => render(proxy.p) });
  Object.entries(BEAT_LABELS).forEach(([name, at]) => tl.addLabel(name, at));
  const pin = ScrollTrigger.create({
    trigger: stage,
    start: 'top top',
    end: () => `+=${Math.round(window.innerHeight * PIN_SCREENS)}`,
    pin: stage,
    pinType: 'transform', // as every pin on the page (Lenis moves the page; DESIGN.md §5)
    scrub: SCRUB,
    snap: SNAP,
    animation: tl,
    invalidateOnRefresh: true,
    onUpdate: gust,
    // A refresh (resize) reverts the timeline, drawing the opening pose, and puts its playhead back
    // without events: past the pin nothing would redraw it, so the bench is posed again here.
    onRefresh: () => render(proxy.p),
  });
  render(0);
  ScrollTrigger.sort();
  ScrollTrigger.refresh();
  // Arriving above the reader, the pin's scroll room would push the page on screen down by ~2 screens.
  const shift = scrollShiftFor(before, section.getBoundingClientRect().height, window.innerHeight);
  if (shift) scroller?.shift?.(shift);

  return {
    /** A visitor's pick: scroll to where that rule's beat comes to rest. */
    goTo(id) {
      const y = pin.labelToScroll(labelFor(id));
      if (scroller) scroller.scrollToY(y);
      else window.scrollTo({ top: y, behavior: 'smooth' });
    },
    destroy() {
      pin.kill(true);
      introTrigger.kill();
      intro.tl.kill();
      tl.kill();
      intro.split?.revert();
      gsap.set([section.querySelector('.rules__sky'), section.querySelector('.rules__lead'), section.querySelector('.articles'), filter, ...$$(section, '.articles > [data-rule]'), ...$$(section, '.rules__sea path'), section.querySelector('.rules__slot')].filter(Boolean), { clearProps: 'all' });
      caption.remove();
      underlines.forEach((line) => line.remove());
      delete section.dataset.show;
      ScrollTrigger.refresh();
    },
  };
}
