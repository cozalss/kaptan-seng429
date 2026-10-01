// The pinned Tayfa timeline: the strip travels until the closed chart spread stands centred, the
// last cards hold for a beat (still clickable), the leaf turns over the gutter, the course is
// inked across the double page, then a short hold before the pin lets go.
//
// The leaf is NOT a tween of its own. It is computed from the parent timeline's playhead on every
// frame (`turnProgressAt(tl.time())`). A `fromTo(turn.state, …, { onUpdate })` used to hand its
// onUpdate to GSAP's internal `_startAt` tween, which re-rendered progress 0 behind the playhead
// and shut the book mid-climax while the course kept inking over blank paper.

import { gsap } from 'gsap';
import { addInk } from './chart-spread.js';

const TRAVEL = 1;
// the last cards stay fully on screen and clickable before the leaf lifts
const CARDS_HOLD = 0.08;
const TURN = 0.26;
const INK = 0.32;
const HOLD = 0.1;
const TURN_AT = TRAVEL + CARDS_HOLD;
const INK_AT = TURN_AT + TURN;
// the cards under the leaf dissolve while it stands (outside the spread they would stay in view)
const FADE_AT = TURN_AT + TURN * 0.3;
const FADE = TURN * 0.45;

export const PHASE = Object.freeze({
  TRAVEL,
  CARDS_HOLD,
  TURN,
  INK,
  HOLD,
  TURN_AT,
  INK_AT,
  TOTAL: INK_AT + INK + HOLD,
});

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);
// power1.inOut: the leaf lifts slowly off the right page, falls faster, lands softly
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

/** Turn progress (0 closed … 1 open) at timeline time `time`. */
export function turnProgressAt(time) {
  return easeInOut(clamp01((time - TURN_AT) / TURN));
}

/** The spread owns the pin (cards take no input) once the leaf has passed upright over them. */
export function spreadOwnsPin(time) {
  return turnProgressAt(time) >= 0.5;
}

/**
 * @param {{ strip: HTMLElement, track: HTMLElement, ink: object | null }} parts
 * @param {{ state: { progress: number }, apply: () => void }} turn  from createPageTurn
 * @param {() => number} travel  strip travel in px
 * @param {{ onFrame?: (frame: { time: number, spread: boolean }) => void, scrollTrigger?: object }} [options]
 */
export function buildStripTimeline({ strip, track, ink }, turn, travel, { onFrame, scrollTrigger } = {}) {
  let tl = null; // a ScrollTrigger may refresh while the timeline is still being built
  const frame = () => {
    const time = tl.time();
    // always written: whatever else touched the leaf, the playhead decides what is drawn
    turn.state.progress = turnProgressAt(time);
    turn.apply();
    onFrame?.({ time, spread: spreadOwnsPin(time) });
  };
  // A refresh (resize) reverts the timeline and puts the playhead back with events suppressed, so
  // no onUpdate follows: past the pin's end nothing scrubs it again and the leaf stayed shut over
  // the inked course. Each refresh therefore redraws the frame from the playhead as well.
  const pinned = scrollTrigger
    ? {
        scrollTrigger: {
          ...scrollTrigger,
          onRefresh: (self) => {
            scrollTrigger.onRefresh?.(self);
            if (tl) frame();
          },
        },
      }
    : {};
  tl = gsap.timeline({ defaults: { ease: 'none' }, onUpdate: frame, ...pinned });
  tl.to(strip, { x: () => -travel(), duration: TRAVEL }, 0)
    .fromTo(track, { opacity: 1 }, { opacity: 0, duration: FADE, immediateRender: false }, FADE_AT);
  if (ink?.course) addInk(tl, ink, { at: INK_AT, duration: INK });
  // the hold: the finished chart rests before the page scrolls on (also fixes the total length)
  tl.to({}, { duration: HOLD }, INK_AT + INK);
  return tl;
}
