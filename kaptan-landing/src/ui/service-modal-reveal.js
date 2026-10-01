// The detail page's type, set on the page once the plate has landed (service-modal-motion.js):
// the running head and ✕ fade in, the input/output line inks in behind its rule like the book's
// caption panels, the description rises line by line out of masks (SplitText), the "Ne yapmaz"
// caption inks in — inside the box that flew over from the card, or with its box when nothing
// flew — and the button to the route follows. Last, once the type has set, the agent's live plate
// (agent-scenes/) inks in under it and starts. Closing takes it all off at once, quickly.
//
// SplitText runs only for the length of the reveal and is reverted when it ends (or is cut
// short), so the text at rest is the plain paragraph screen readers and resizes expect.

import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

const EASE = 'expo.out';
const INK_HIDDEN = 'inset(0% 100% 0% 0%)';
// Outset so the caption's tilt and hard shadow are not cut once it is inked.
const INK_SHOWN = 'inset(-12px -12px -12px -12px)';
const OUT_S = 0.18;
// The live plate inks in once the description's lines have risen.
const SCENE_AFTER_S = 0.62;

function splitLines(el) {
  try {
    const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'service-modal__split-line' });
    return split.lines.length ? split : (split.revert(), null);
  } catch {
    return null; // no layout to measure (or a font edge case): the paragraph fades up instead
  }
}

/**
 * @param {{
 *   title: HTMLElement, head: HTMLElement[], meta: HTMLElement, description: HTMLElement,
 *   caption: HTMLElement, cta: HTMLElement, scene?: HTMLElement|null, onSceneIn?: () => void,
 * }} parts `title` is the Bodoni line inside its masking heading; `scene` is the live plate
 * (optional) and `onSceneIn` starts it as it inks in.
 */
export function createDetailReveal({ title, head, meta, description, caption, cta, scene = null, onSceneIn = () => {} }) {
  const plate = scene ? [scene] : [];
  const all = [title, ...head, meta, description, caption, cta, ...plate];
  let split = null;

  function revert() {
    split?.revert();
    split = null;
  }

  /**
   * Every piece of type off the page, ready to be set; a title that flies in stays hidden for it.
   * `keepHead` leaves the running head (and its page turner) standing: a turn to the next agent.
   */
  function hide({ titleFlies = false, keepHead = false } = {}) {
    revert();
    const pieces = keepHead ? all.filter((el) => !head.includes(el)) : all;
    gsap.killTweensOf(pieces);
    gsap.set(pieces, { clearProps: 'all' });
    gsap.set(title, titleFlies ? { visibility: 'hidden' } : { yPercent: 110 });
    gsap.set(caption, { clipPath: INK_HIDDEN });
    gsap.set(keepHead ? [cta] : [...head, cta], { opacity: 0 });
    gsap.set(cta, { y: 14 });
    gsap.set(meta, { clipPath: INK_HIDDEN });
    gsap.set(description, { opacity: 0 });
    if (scene) gsap.set(scene, { clipPath: INK_HIDDEN });
  }

  /** Adds the setting of the type to `tl`, starting at `at` seconds. */
  function show(tl, at, { titleFlies = false, captionAt = at, keepHead = false } = {}) {
    if (!titleFlies) tl.to(title, { yPercent: 0, duration: 1, ease: EASE }, at);
    if (!keepHead) tl.to(head, { opacity: 1, duration: 0.5, ease: 'power1.out', stagger: 0.08 }, at);
    tl.to(meta, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.8, ease: EASE }, at + 0.08);
    tl.add(() => {
      split = splitLines(description);
      gsap.set(description, { opacity: 1 });
      if (!split) {
        gsap.fromTo(description, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.8, ease: EASE });
        return;
      }
      gsap.from(split.lines, { yPercent: 105, duration: 0.9, ease: EASE, stagger: 0.07, onComplete: revert });
    }, at + 0.16);
    tl.to(caption, { clipPath: INK_SHOWN, duration: 0.9, ease: EASE }, captionAt);
    tl.to(cta, { opacity: 1, y: 0, duration: 0.7, ease: EASE }, at + 0.34);
    if (!scene) return;
    tl.add(onSceneIn, at + SCENE_AFTER_S);
    tl.to(scene, { clipPath: INK_SHOWN, duration: 1.1, ease: EASE }, at + SCENE_AFTER_S);
  }

  /** Lifts the type off the page for a close (or, `keepHead`, for a turn); the caption un-inks. */
  function takeOff(tl, at = 0, { keepHead = false } = {}) {
    revert();
    gsap.killTweensOf(keepHead ? all.filter((el) => !head.includes(el)) : all);
    tl.to([...(keepHead ? [] : head), meta, description, cta, ...plate], { opacity: 0, duration: OUT_S, ease: 'power1.in' }, at);
    tl.to(caption, { clipPath: 'inset(-12px -12px -12px 100%)', duration: OUT_S + 0.06, ease: 'power2.in' }, at);
    tl.to(caption, { opacity: 0, duration: 0.08, ease: 'none' }, at + OUT_S - 0.02);
  }

  function clear() {
    revert();
    gsap.killTweensOf(all);
    gsap.set(all, { clearProps: 'all' });
  }

  return { hide, show, takeOff, clear };
}
