import { gsap } from 'gsap';
import { coverRadius, ringFrame } from '../../lib/geometry.js';
import { safeStorage } from '../../utils/safe-storage.js';
import { hideLoader } from './loader.js';

const SEEN_KEY = 'kaptan:intro-seen';
// Compass ring of the #kaptan-logo symbol (viewBox 0 0 212 64): centre and mid-stroke radius.
const RING_VIEW = { width: 212, height: 64, cx: 30, cy: 32, r: 27 };
// ≈0.85 s in all: the compass ring closes, opens onto the hero while the letters rise, header follows.
const T = { close: 0.14, open: 0.62, fade: 0.2, letters: 0.26, header: 0.4, headerFade: 0.4 };

/** First visit in this tab session? Blocked storage falls back to memory: then it counts as first. */
export function isFirstVisit(storage = safeStorage('sessionStorage')) {
  return storage.getItem(SEEN_KEY) !== '1';
}

function markVisited(storage = safeStorage('sessionStorage')) {
  storage.setItem(SEEN_KEY, '1');
}

/**
 * The cinematic aperture plays once per tab session, never under reduced motion and never when
 * the visitor asked to save data; everyone else gets the quick fade.
 */
export function shouldPlayCinematic({ reduced, firstVisit, saveData }) {
  return !reduced && firstVisit && !saveData;
}

/** navigator.connection.saveData, where supported. */
export function prefersSaveData(nav = globalThis.navigator) {
  return nav?.connection?.saveData === true;
}

function measure(logo) {
  const frame = ringFrame(logo.getBoundingClientRect(), RING_VIEW);
  const cover = coverRadius(frame.x, frame.y, window.innerWidth, window.innerHeight);
  const circle = (r) => `circle(${r.toFixed(1)}px at ${frame.x.toFixed(1)}px ${frame.y.toFixed(1)}px)`;
  return { frame, circle, grow: cover / frame.r };
}

function buildTimeline({ loader, stage, header, heroIntro, onOpen }) {
  const logo = loader.querySelector('[data-loader-logo]');
  const ring = loader.querySelector('[data-loader-ring]');
  const chrome = loader.querySelectorAll('[data-loader-chrome]');
  const { frame, circle, grow } = measure(logo);
  const root = document.documentElement;

  const tl = gsap.timeline({ defaults: { ease: 'expo.inOut' } });
  tl.to(ring, { drawSVG: '0% 100%', duration: T.close, ease: 'power2.out' }, 0)
    .to(chrome, { opacity: 0, duration: T.fade, ease: 'power2.out' }, 0)
    .set(header, { opacity: 0 }, 0)
    .add(() => onOpen?.(), 0)
    .add(() => {
      root.classList.add('is-aperture');
      loader.classList.add('is-aperture');
    }, T.close)
    .fromTo(stage, { clipPath: circle(frame.r) }, { clipPath: circle(frame.r * grow), duration: T.open }, T.close)
    .fromTo(
      logo,
      { scale: 1, transformOrigin: `${frame.originX}px ${frame.originY}px` },
      { scale: grow, duration: T.open },
      T.close,
    )
    .to(logo, { opacity: 0, duration: T.open * 0.55, ease: 'power1.in' }, T.close + 0.05)
    .to(header, { opacity: 1, duration: T.headerFade, ease: 'power2.out' }, T.header);
  if (heroIntro) tl.add(heroIntro({ fast: true }), T.letters);
  return tl;
}

function cleanUp({ loader, stage, header }) {
  document.documentElement.classList.remove('is-aperture');
  if (stage) gsap.set(stage, { clearProps: 'clipPath' });
  if (header) gsap.set(header, { clearProps: 'opacity' });
  if (!loader) return;
  loader.classList.remove('is-aperture');
  loader.classList.add('is-instant');
  hideLoader(loader);
}

/** Fatal fallback: stops a running intro and puts loader, stage and header in their end state. */
export function abortIntro({ loader, stage, header }) {
  const logo = loader?.querySelector('[data-loader-logo]');
  gsap.killTweensOf([stage, header, logo, loader?.querySelector('[data-loader-ring]')].filter(Boolean));
  cleanUp({ loader, stage, header });
}

/**
 * Hands over from the loader to the hero.
 * First visit per session: the compass ring closes, becomes a circular window onto the hero stage and
 * opens to full screen while the hero letters rise (≈0.85 s). Otherwise: a quick fade.
 * `onOpen` runs as the aperture starts (the page becomes interactive then, not after the intro).
 * Resolves when the hand-over is finished.
 */
export function playIntro({ loader, stage, header, heroIntro, cinematic, onOpen }) {
  const canPlay = cinematic && loader?.querySelector('[data-loader-logo]') && stage;
  if (!canPlay) {
    hideLoader(loader);
    onOpen?.();
    heroIntro?.();
    return Promise.resolve();
  }
  markVisited();
  const parts = { loader, stage, header, heroIntro, onOpen };
  return new Promise((resolve) => {
    const tl = buildTimeline(parts);
    tl.eventCallback('onComplete', () => {
      cleanUp(parts);
      resolve();
    });
  });
}
