// The agent card ↔ detail page transition, told as a page of the book being turned.
//
// Open: the card's inked plate is picked up off the strip — its hard shadow lengthens as it
// rises and it tips a little as it is carried — and flies on a slight arc to its place on the
// detail page, where it is set down (the shadow shortens to the plate's own). The agent's name
// slides out from under it and flies to the Bodoni title.
// Meanwhile the strip behind sinks under an indigo ink wash and the detail page is turned in
// from the right, its inked edge riding the turn. Once the plate lands, the page's type is set
// (service-modal-reveal.js). Close runs the same story backwards and sets every piece down
// exactly on the card it came from. Ghost geometry and ink live in service-modal-ghosts.js.
//
// Interruption-safe: every tween goes *to* a pose from wherever things are, so Esc mid-open, a
// reopen mid-close, Back/Forward and rapid clicks all carry on from the current frame. A
// generation counter keeps a late landing from touching a flight a newer transition owns.
//
// GSAP rather than document.startViewTransition(): a view transition freezes the page into
// snapshots (no interrupting a half-open page with Esc) and can only cross-fade what it captured.
//
// Modes: 'page' (desktop), 'sheet' (≤767px: the page slides up from the foot like a sheet laid
// over the strip) and 'reduced' (prefers-reduced-motion: a plain fade).

import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import {
  createNameGhost,
  createPlateGhost,
  flipVars,
  homeVars,
  inkOf,
  layoutBox,
  paintInk,
  removeGhost,
} from './service-modal-ghosts.js';
import { createDetailReveal } from './service-modal-reveal.js';

const SHEET_QUERY = '(max-width: 767px)';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
const CARD_MEDIA = '.service-card__media';
const CARD_NAME = '.service-card__name';
const PARTS = ['plate', 'name'];
const UNIFORM = { plate: 'width', name: 'height' };

gsap.registerPlugin(CustomEase);

// Scale and height ride one curve, the sideways travel a softer one: the pieces fly on an arc.
// Both leave at once (a click answers on its first frame) and take a long, soft set-down.
const FLIGHT_EASE = CustomEase.create('kaptanFlight', 'M0,0 C0.34,0 0.1,1 1,1');
const DRIFT_EASE = CustomEase.create('kaptanDrift', 'M0,0 C0.5,0 0.18,1 1,1');
const TURN_EASE = 'power3.inOut';
const SHEET_EASE = 'power4.inOut';
const LIFT_SHADOW = 14; // px of hard shadow at the top of the flight
const LIFT_TILT = 1.4; // deg the plate tips while it is carried
const WASH_OPACITY = 0.22;
const FADE_S = 0.2;
const IMAGE_READY_TIMEOUT_MS = 1200;
const CLIP_SHOWN = 'inset(0% 0% 0% 0%)';
const CLIP_OFF_RIGHT = 'inset(0% 0% 0% 100%)';

// Seconds. `stagger` sets the name off a beat behind the plate, so the two part and land as a
// sequence rather than as one block.
const OPEN = {
  page: { flight: 0.95, stagger: [0, 0.06], turnAt: 0.06, turn: 0.95, recede: 0.97, text: 0.72, caption: 1 },
  sheet: { flight: 0.85, stagger: [0, 0.06], turnAt: 0, turn: 0.85, recede: 0.94, text: 0.6, caption: 0.85 },
};
const CLOSE = {
  page: { flight: 0.72, stagger: [0.04, 0.02], turnAt: 0.04, turn: 0.72 },
  sheet: { flight: 0.62, stagger: [0.02, 0], turnAt: 0, turn: 0.66 },
};

/** Longest close (≈0.8 s) plus headroom; the overlay hides its root after this. */
export const CLOSE_DURATION_MS = 950;

function matches(win, query) {
  return typeof win.matchMedia === 'function' && win.matchMedia(query).matches;
}

/** @returns {'reduced'|'sheet'|'page'} */
export function motionMode(win = window) {
  if (matches(win, REDUCED_QUERY)) return 'reduced';
  return matches(win, SHEET_QUERY) ? 'sheet' : 'page';
}

/** Resolves once the image can paint (or failed, or after a timeout) — never rejects. */
export function whenImageReady(img, timeoutMs = IMAGE_READY_TIMEOUT_MS) {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  const ready =
    typeof img.decode === 'function'
      ? img.decode().catch(() => {})
      : new Promise((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
  return Promise.race([ready, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

/** The pieces of a card that fly: its plate (media box + photo) and its name. */
export function cardParts(card) {
  if (!card?.querySelector) return null;
  const media = card.querySelector(CARD_MEDIA);
  const img = media?.querySelector('img') ?? null;
  if (!media || !img) return null;
  return { plate: media, img, name: card.querySelector(CARD_NAME) };
}

/** How far the card's photo is zoomed inside its frame (its hover lift), ≥ 1. */
function photoZoom(parts) {
  const inner = parts.plate.clientWidth;
  const shown = parts.img.getBoundingClientRect().width;
  if (!inner || !shown) return 1;
  return Math.min(1.1, Math.max(1, shown / inner));
}

/** The pages's edge that rides the turn: an ink line with the paper's inner shading. */
function createEdge(panel) {
  const edge = document.createElement('span');
  edge.className = 'service-modal__edge';
  edge.setAttribute('aria-hidden', 'true');
  panel.after(edge);
  gsap.set(edge, { autoAlpha: 0 });
  return edge;
}

/**
 * @param {{
 *   panel: HTMLElement, scrim: HTMLElement, media: HTMLElement, image: HTMLImageElement,
 *   title: HTMLElement, head?: HTMLElement[], meta: HTMLElement, description: HTMLElement,
 *   caption: HTMLElement, cta: HTMLElement, scene?: HTMLElement|null, onSceneIn?: () => void,
 *   getPage?: () => HTMLElement|null, win?: Window,
 * }} parts `title` is the Bodoni line inside its masking heading, `media` the inked plate,
 * `caption` the "Ne yapmaz" caption panel, `scene` the live plate that `onSceneIn` starts.
 * @returns {{open: (trigger?: Element) => object, close: (options?: {fade?: boolean}) => object,
 *   swap: (options: {direction?: -1|1, render: () => void}) => object|null, retarget: (trigger?: Element) => void, destroy: () => void}}
 * `open` / `close` return the GSAP timeline they started.
 */
export function createDetailMotion({
  panel,
  scrim,
  media,
  image,
  title,
  head = [],
  meta,
  description,
  caption,
  cta,
  scene = null,
  onSceneIn = () => {},
  getPage =() => document.getElementById('main'),
  win = window,
}) {
  const reveal = createDetailReveal({ title, head, meta, description, caption, cta, scene, onSceneIn });
  const detailEl = { plate: media, name: title };
  const edge = createEdge(panel);
  let timeline = null;
  // The open card's flight: its trigger, the card pieces hidden while their ghosts are away,
  // and the ghosts still in the air. Non-null from open until the close has set them down.
  let flight = null;
  let generation = 0;

  const pageScale = (page) => Number(gsap.getProperty(page, 'scale'));
  const ghosts = () => (flight ? PARTS.map((key) => flight.ghosts[key]).filter(Boolean) : []);
  const paint = () => ghosts().forEach((ghost) => ghost.ink && paintInk(ghost));

  function stopAll() {
    generation += 1;
    timeline?.kill();
    timeline = null;
    const flying = ghosts().flatMap((ghost) => [ghost.el, ghost.ink, ghost.img].filter(Boolean));
    gsap.killTweensOf([panel, scrim, edge, media, image, ...flying]);
  }

  function resetPage() {
    const page = getPage();
    if (!page) return;
    gsap.set(page, { clearProps: 'transform,transformOrigin' });
    if (page.getAttribute('style') === '') page.removeAttribute('style');
  }

  /** The page is only transformed mid-transition, never while the detail sits open (ScrollTrigger measures it). */
  function scalePage(tl, { from, to, duration, ease }) {
    const page = getPage();
    if (!page) return;
    if (pageScale(page) === 1) {
      gsap.set(page, { transformOrigin: `50% ${win.innerHeight / 2 - page.getBoundingClientRect().top}px`, scale: from });
    }
    tl.to(page, { scale: to, duration, ease }, 0);
  }

  function withPageUnscaled(measure) {
    const page = getPage();
    const scale = page ? pageScale(page) : 1;
    if (scale === 1) return measure();
    gsap.set(page, { scale: 1 });
    try {
      return measure();
    } finally {
      gsap.set(page, { scale });
    }
  }

  /** Where the card's pieces sit right now (null for a piece off screen). */
  function measureCard(parts) {
    return withPageUnscaled(() => ({
      plate: layoutBox(parts.plate, win),
      name: parts.name && layoutBox(parts.name, win),
      zoom: photoZoom(parts),
    }));
  }

  /** The detail title's own text box — a single line only (a wrapped name rises in place). */
  function nameHome() {
    const box = layoutBox(title, win);
    if (!box) return null;
    const style = win.getComputedStyle(title);
    const size = parseFloat(style.fontSize) || 0;
    if (size && title.offsetHeight > size * 1.4) return null;
    let width = box.width;
    const range = document.createRange?.();
    if (range && typeof range.getBoundingClientRect === 'function') {
      range.selectNodeContents(title);
      width = range.getBoundingClientRect().width || width;
    }
    const left = box.cx - box.width / 2;
    return {
      home: { ...box, cx: left + width / 2, width },
      style: {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight,
      },
    };
  }

  /** A ghost for one piece, laid out at its place on the detail page. */
  function makeGhost(key, cardParts) {
    if (key === 'plate') {
      const home = layoutBox(media, win);
      if (!home) return null;
      const src = cardParts?.img.currentSrc || cardParts?.img.src || image.currentSrc || image.src;
      return createPlateGhost({ src, objectPosition: win.getComputedStyle(image).objectPosition, home, ink: inkOf(media, win) });
    }
    const found = nameHome();
    return found && createNameGhost({ text: title.textContent, home: found.home, style: found.style });
  }

  /** Swaps the plate ghost's photo for the detail's sharper one once it is decoded. */
  function sharpenPlate(ghost) {
    const src = image.currentSrc || image.src;
    if (!src || ghost.img.src === src) return;
    const sharp = new Image();
    sharp.alt = '';
    sharp.src = src;
    sharp.style.cssText = ghost.img.style.cssText;
    const decoded = typeof sharp.decode === 'function' ? sharp.decode() : Promise.resolve();
    decoded
      .then(() => {
        if (flight?.ghosts.plate !== ghost || !ghost.el.isConnected) return;
        gsap.set(sharp, { scale: gsap.getProperty(ghost.img, 'scale') });
        ghost.img.replaceWith(sharp);
        ghost.img = sharp;
      })
      .catch(() => {});
  }

  /** Flies a ghost to `pose` from wherever it is, lifting and setting down its ink frame. */
  function fly(tl, ghost, pose, { at, duration, ink, tilt = 0, ease = FLIGHT_EASE }) {
    const { rotation, x, ...rest } = pose;
    tl.to(ghost.el, { x, duration, ease: ease === FLIGHT_EASE ? DRIFT_EASE : ease }, at);
    tl.to(ghost.el, { ...rest, duration, ease }, at);
    if (tilt) {
      tl.to(ghost.el, { rotation: rotation + tilt, duration: duration * 0.45, ease: 'power2.out' }, at);
      tl.to(ghost.el, { rotation, duration: duration * 0.55, ease: 'power2.inOut' }, at + duration * 0.45);
    } else {
      tl.to(ghost.el, { rotation, duration, ease }, at);
    }
    if (!ghost.ink) return;
    tl.to(ghost.ink, { shadow: LIFT_SHADOW, duration: duration * 0.4, ease: 'power2.out' }, at);
    tl.to(ghost.ink, { ...ink, duration: duration * 0.6, ease: 'power2.inOut' }, at + duration * 0.4);
  }

  /** Sets a landed ghost down: the real piece takes its place (the plate once its photo is ready). */
  function land(key) {
    const ghost = flight?.ghosts[key];
    if (!ghost) return;
    const current = generation;
    const settle = () => {
      if (generation !== current || flight?.ghosts[key] !== ghost) return;
      gsap.set(detailEl[key], { clearProps: 'visibility' });
      removeGhost(ghost);
      flight.ghosts[key] = null;
    };
    if (key === 'plate') whenImageReady(image).then(settle);
    else settle();
  }

  function hideCardPiece(el) {
    if (!el || flight.hidden.includes(el)) return;
    el.style.visibility = 'hidden';
    flight.hidden.push(el);
  }

  function dropFlight() {
    if (!flight) return;
    ghosts().forEach(removeGhost);
    flight.hidden.forEach((el) => {
      el.style.visibility = '';
    });
    flight = null;
    gsap.set(media, { clearProps: 'visibility' });
  }

  /** Lifts the card's pieces into ghosts posed exactly over them. */
  function liftFromCard(trigger) {
    flight = { trigger: trigger ?? null, ghosts: {}, hidden: [] };
    const parts = cardParts(trigger);
    const boxes = parts && measureCard(parts);
    if (!boxes?.plate) return;
    for (const key of PARTS) {
      const target = boxes[key];
      if (!target) continue;
      const ghost = makeGhost(key, parts);
      if (!ghost) {
        if (key === 'plate') return; // no plate to fly: nothing flies
        continue;
      }
      flight.ghosts[key] = ghost;
      gsap.set(ghost.el, flipVars(ghost.home, target, { uniform: UNIFORM[key] }));
      if (ghost.img) gsap.set(ghost.img, { scale: boxes.zoom });
      if (ghost.ink) Object.assign(ghost.ink, inkOf(parts[key], win));
      hideCardPiece(parts[key]);
    }
    if (flight.ghosts.plate) gsap.set(media, { visibility: 'hidden' });
    paint();
  }

  function turnIn(tl, mode, { at, duration }) {
    gsap.set(edge, { autoAlpha: 1 });
    if (mode === 'sheet') {
      tl.to([panel, edge], { yPercent: 0, duration, ease: SHEET_EASE }, at);
    } else {
      tl.to(panel, { clipPath: CLIP_SHOWN, duration, ease: TURN_EASE }, at);
      tl.to(edge, { xPercent: 0, duration, ease: TURN_EASE }, at);
    }
    tl.set(edge, { autoAlpha: 0 }, at + duration);
  }

  function openTimeline(mode, trigger) {
    const tl = gsap.timeline({ onUpdate: paint });
    if (mode === 'reduced') {
      dropFlight();
      resetPage();
      reveal.clear();
      gsap.set(edge, { autoAlpha: 0 });
      tl.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: FADE_S, ease: 'none' });
      tl.fromTo(scrim, { opacity: 0 }, { opacity: WASH_OPACITY, duration: FADE_S, ease: 'none' }, 0);
      tl.add(onSceneIn, 0); // the plate's still, drawn at once
      return tl;
    }
    const t = OPEN[mode];
    const resuming = Boolean(flight) && flight.trigger === (trigger ?? null) && ghosts().length > 0;
    if (!resuming) {
      dropFlight();
      resetPage();
      gsap.set([panel, scrim, edge], { clearProps: 'all' });
      panel.scrollTop = 0;
      // Measured while the page still rests where it lands: the ghosts are laid out there.
      liftFromCard(trigger);
      if (mode === 'sheet') gsap.set([panel, edge], { yPercent: 100 });
      else {
        gsap.set(panel, { clipPath: CLIP_OFF_RIGHT });
        gsap.set(edge, { xPercent: 100 });
      }
      gsap.set(scrim, { opacity: 0 });
    }
    const flying = flight.ghosts;
    reveal.hide({ titleFlies: Boolean(flying.name) });
    if (!flying.plate) {
      // No card on screen (deep link, Forward): the plate uncovers upward in place instead.
      tl.fromTo(media, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: CLIP_SHOWN, duration: t.flight, ease: FLIGHT_EASE }, 0.2);
      tl.fromTo(image, { scale: 1.12 }, { scale: 1, duration: t.flight + 0.4, ease: 'expo.out' }, 0.2);
    }
    PARTS.forEach((key, i) => {
      const ghost = flying[key];
      if (!ghost) return;
      const at = t.stagger[i];
      const ease = mode === 'sheet' ? SHEET_EASE : FLIGHT_EASE;
      fly(tl, ghost, homeVars(ghost.home), { at, duration: t.flight, ink: inkOf(detailEl[key], win), tilt: key === 'plate' ? -LIFT_TILT : 0, ease });
      if (ghost.img) tl.to(ghost.img, { scale: 1, duration: t.flight, ease }, at);
      tl.add(() => land(key), at + t.flight);
    });
    if (flying.plate) whenImageReady(image).then(() => flight?.ghosts.plate === flying.plate && sharpenPlate(flying.plate));
    tl.to(scrim, { opacity: WASH_OPACITY, duration: 0.55, ease: 'power2.out' }, 0);
    scalePage(tl, { from: 1, to: t.recede, duration: t.turn, ease: mode === 'sheet' ? SHEET_EASE : TURN_EASE });
    turnIn(tl, mode, { at: t.turnAt, duration: t.turn });
    reveal.show(tl, t.text, { titleFlies: Boolean(flying.name), captionAt: t.caption });
    tl.add(resetPage, t.turnAt + t.turn); // the page now covers the strip: drop its transform
    return tl;
  }

  function open(trigger) {
    stopAll();
    timeline = openTimeline(motionMode(win), trigger);
    return timeline;
  }

  /** Lifts a piece still resting on the detail page into a ghost, for the flight back. */
  function liftFromDetail(key, parts) {
    const ghost = makeGhost(key, parts);
    if (!ghost) return null;
    gsap.set(ghost.el, homeVars(ghost.home));
    if (key === 'plate') {
      ghost.img.src = image.currentSrc || image.src;
      gsap.set(media, { visibility: 'hidden' });
    } else {
      gsap.set(detailEl[key], { visibility: 'hidden' });
    }
    return ghost;
  }

  function flyHome(tl, mode) {
    const t = CLOSE[mode];
    const parts = cardParts(flight?.trigger);
    const boxes = parts && measureCard(parts);
    const ease = mode === 'sheet' ? SHEET_EASE : FLIGHT_EASE;
    PARTS.forEach((key, i) => {
      const target = boxes?.[key];
      let ghost = flight.ghosts[key];
      if (!target || !boxes.plate) {
        removeGhost(ghost);
        flight.ghosts[key] = null;
        gsap.set(detailEl[key], { clearProps: 'visibility' });
        return;
      }
      if (!ghost) {
        ghost = liftFromDetail(key, parts);
        if (!ghost) return;
        flight.ghosts[key] = ghost;
      }
      const at = t.stagger[i];
      fly(tl, ghost, flipVars(ghost.home, target, { uniform: UNIFORM[key] }), { at, duration: t.flight, ink: inkOf(parts[key], win), tilt: key === 'plate' ? LIFT_TILT : 0, ease });
      if (ghost.img) tl.to(ghost.img, { scale: boxes.zoom, duration: t.flight, ease }, at);
    });
    paint();
  }

  function turnOut(tl, mode) {
    const t = CLOSE[mode];
    gsap.set(edge, { autoAlpha: 1 });
    if (mode === 'sheet') {
      tl.to([panel, edge], { yPercent: 100, duration: t.turn, ease: SHEET_EASE }, t.turnAt);
    } else {
      tl.to(panel, { clipPath: CLIP_OFF_RIGHT, duration: t.turn, ease: TURN_EASE }, t.turnAt);
      tl.to(edge, { xPercent: 100, duration: t.turn, ease: TURN_EASE }, t.turnAt);
    }
    tl.to(scrim, { opacity: 0, duration: 0.45, ease: 'power2.inOut' }, t.turnAt + t.turn - 0.45);
    scalePage(tl, { from: OPEN[mode].recede, to: 1, duration: t.turn + t.turnAt, ease: mode === 'sheet' ? SHEET_EASE : TURN_EASE });
  }

  function finishClose() {
    dropFlight();
    resetPage();
    gsap.set(edge, { autoAlpha: 0 });
    timeline = null;
  }

  function closeTimeline(mode) {
    const tl = gsap.timeline({ onUpdate: paint, onComplete: finishClose });
    if (mode === 'reduced' || mode === 'fade') {
      dropFlight();
      gsap.set(edge, { autoAlpha: 0 });
      tl.to([panel, scrim], { opacity: 0, duration: FADE_S, ease: 'none' }, 0);
      const page = getPage();
      if (page && pageScale(page) !== 1) tl.to(page, { scale: 1, duration: FADE_S, ease: 'none' }, 0);
      return tl;
    }
    flight ??= { trigger: null, ghosts: {}, hidden: [] };
    reveal.takeOff(tl, 0);
    flyHome(tl, mode);
    turnOut(tl, mode);
    return tl;
  }

  /** `fade: true` skips the morph (e.g. the detail hands off to the next section). */
  function close({ fade = false } = {}) {
    stopAll();
    const mode = motionMode(win);
    timeline = closeTimeline(fade && mode !== 'reduced' ? 'fade' : mode);
    return timeline;
  }

  /** The ghosts of an unfinished flight are set down at once (a turn interrupts the open). */
  function landAll() {
    if (!flight) return;
    ghosts().forEach(removeGhost);
    flight.ghosts = {};
    gsap.set([media, title], { clearProps: 'visibility' });
  }

  /** The detail page as it rests open: page turned in, wash down, nothing in the air. */
  function settleOpen() {
    landAll();
    resetPage();
    gsap.set(panel, { clearProps: 'clipPath,opacity,transform' });
    gsap.set(edge, { autoAlpha: 0 });
    gsap.set(scrim, { opacity: WASH_OPACITY });
  }

  /** A shadow string with its offsets set to `px` ("rgb(…) 6px 6px 0px 0px" → 14px 14px). */
  function liftedShadow(rest, px) {
    return rest.replace(/(-?\d+(?:\.\d+)?)px (-?\d+(?:\.\d+)?)px/, `${px}px ${px}px`);
  }

  /**
   * Turns the open detail to another agent in place: the type and the plate are lifted off,
   * `render()` swaps the content, then the new plate is carried in from the side of the turn and
   * set down (its hard shadow shortens as it lands) while the type is set again. The running
   * head and its page turner stay put.
   * @param {{ direction?: -1 | 1, render: () => void }} options
   */
  function swap({ direction = 1, render }) {
    stopAll();
    settleOpen();
    const mode = motionMode(win);
    if (mode === 'reduced') {
      render();
      panel.scrollTop = 0;
      reveal.clear();
      onSceneIn();
      return null;
    }
    const rest = win.getComputedStyle(media).boxShadow;
    const lifted = rest && rest !== 'none' ? liftedShadow(rest, LIFT_SHADOW) : null;
    const dx = 32 * direction;
    const current = generation;
    // Two timelines: the setting-in is built only once the new content is in (hide() kills the
    // tweens of the type, which would take a prebuilt show with it).
    const setIn = () => {
      if (generation !== current) return;
      render();
      panel.scrollTop = 0;
      reveal.hide({ keepHead: true });
      gsap.set(media, { x: dx * 1.8, y: -12, rotation: 1.6 * direction, autoAlpha: 1, ...(lifted ? { boxShadow: lifted } : {}) });
      gsap.set(image, { scale: 1.06 });
      const tl = gsap.timeline({ onComplete: () => gsap.set([media, image], { clearProps: 'transform,boxShadow,opacity,visibility' }) });
      tl.to(media, { x: 0, y: 0, rotation: 0, duration: 0.72, ease: FLIGHT_EASE }, 0);
      tl.to(image, { scale: 1, duration: 0.9, ease: 'expo.out' }, 0);
      if (lifted) tl.to(media, { boxShadow: rest, duration: 0.42, ease: 'power2.inOut' }, 0.28);
      reveal.show(tl, 0.12, { keepHead: true });
      timeline = tl;
    };
    const out = gsap.timeline({ onComplete: setIn });
    reveal.takeOff(out, 0, { keepHead: true });
    out.to(title, { yPercent: -110, duration: 0.22, ease: 'power2.in' }, 0);
    out.to(media, { x: -dx, rotation: -0.8 * direction, autoAlpha: 0, duration: 0.24, ease: 'power2.in' }, 0);
    timeline = out;
    return out;
  }

  /**
   * The card the page will be set back onto when it closes (after a turn, the last agent shown):
   * the old card's pieces come back, the new card's are hidden while their ghosts are away.
   */
  function retarget(trigger) {
    if (!flight) flight = { trigger: null, ghosts: {}, hidden: [] };
    flight.hidden.forEach((el) => {
      el.style.visibility = '';
    });
    flight.hidden = [];
    flight.trigger = trigger ?? null;
  }

  function destroy() {
    stopAll();
    finishClose();
    reveal.clear();
    edge.remove();
  }

  return { open, close, swap, retarget, destroy };
}
